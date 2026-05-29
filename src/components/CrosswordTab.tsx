import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { buildDailyCrossword, type CrosswordCell, type CrosswordClue } from '../lib/crossword.ts'
import { supabase } from '../lib/supabase'
import goldMedal from '../assets/oro.png'
import silverMedal from '../assets/copa-de-plata.png'
import bronzeMedal from '../assets/copa-de-bronce.png'

type CrosswordTabProps = {
  session: Session
  dateKey: string
  showGame: boolean
  onBackToPodium: () => void
}

type PodiumEntry = {
  userId: string
  username: string
  seconds: number
}

type CellFeedback = 'none' | 'correct' | 'wrong'
type TypingDirection = 'across' | 'down'
type ActiveCell = { row: number; col: number } | null
type ValidationPhase = 'idle' | 'reveal' | 'clear'

const MAX_CHECKS = 2

const formatSeconds = (value: number): string => {
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function CrosswordTab({ session, dateKey, showGame, onBackToPodium }: CrosswordTabProps) {
  const puzzle = useMemo(() => buildDailyCrossword(dateKey), [dateKey])
  const [cells, setCells] = useState<string[][]>(() =>
    puzzle.grid.map((row: CrosswordCell[]) => row.map((cell: CrosswordCell) => (cell.blocked ? '#' : ''))),
  )
  const [feedback, setFeedback] = useState<CellFeedback[][]>(() =>
    puzzle.grid.map((row: CrosswordCell[]) => row.map((cell: CrosswordCell) => (cell.blocked ? 'none' : 'none'))),
  )
  const [activeCell, setActiveCell] = useState<ActiveCell>(null)
  const [typingDirection, setTypingDirection] = useState<TypingDirection>('across')
  const [podium, setPodium] = useState<PodiumEntry[]>([])
  const [statusText, setStatusText] = useState<string | null>(null)
  const [hasSolvedToday, setHasSolvedToday] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [checkUses, setCheckUses] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isAnimatingCompletion, setIsAnimatingCompletion] = useState(false)
  const [completionStep, setCompletionStep] = useState(0)
  const [validationPhase, setValidationPhase] = useState<ValidationPhase>('idle')
  const [validationStep, setValidationStep] = useState(0)
  const [validationFeedbackMatrix, setValidationFeedbackMatrix] = useState<CellFeedback[][] | null>(null)
  const startedAt = useRef<number | null>(null)
  const completionStarted = useRef(false)
  const mobileInputRef = useRef<HTMLInputElement | null>(null)

  const answerCoords = useMemo(() => {
    const coords: Array<{ row: number; col: number }> = []
    for (let row = 0; row < puzzle.size; row += 1) {
      for (let col = 0; col < puzzle.size; col += 1) {
        if (!puzzle.grid[row][col].blocked) {
          coords.push({ row, col })
        }
      }
    }
    return coords
  }, [puzzle.grid, puzzle.size])

  const animationOrderByCell = useMemo(() => {
    const map = new Map<string, number>()
    answerCoords.forEach(({ row, col }, index) => {
      map.set(`${row}-${col}`, index)
    })
    return map
  }, [answerCoords])

  const isValidationAnimating = validationPhase !== 'idle'

  const focusMobileInput = useCallback(() => {
    if (!mobileInputRef.current || hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
      return
    }

    mobileInputRef.current.focus()
    mobileInputRef.current.select()
  }, [hasSolvedToday, isAnimatingCompletion, isValidationAnimating, schemaMissing])

  const refreshPodium = useCallback(async () => {
    const { data, error } = await supabase
      .from('crossword_attempts')
      .select('user_id,seconds')
      .eq('date', dateKey)
      .order('seconds', { ascending: true })

    if (error) {
      const relationMissing = error.message.toLowerCase().includes('crossword_attempts')
      if (relationMissing) {
        setSchemaMissing(true)
      }
      return
    }

    setSchemaMissing(false)

    const userIds = [...new Set((data ?? []).map((item) => item.user_id))]
    let usernameById: Record<string, string> = {}

    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id,username')
        .in('id', userIds)

      usernameById = (profilesData ?? []).reduce<Record<string, string>>((acc, profile) => {
        acc[profile.id] = profile.username
        return acc
      }, {})
    }

    const nextPodium = (data ?? []).map((item) => ({
      userId: item.user_id,
      username: usernameById[item.user_id] ?? `player-${item.user_id.slice(0, 6)}`,
      seconds: item.seconds,
    }))

    setPodium(nextPodium)
  }, [dateKey])

  const loadMyAttempt = useCallback(async () => {
    const { data, error } = await supabase
      .from('crossword_attempts')
      .select('seconds')
      .eq('user_id', session.user.id)
      .eq('date', dateKey)
      .maybeSingle()

    if (error) {
      const relationMissing = error.message.toLowerCase().includes('crossword_attempts')
      if (relationMissing) {
        setSchemaMissing(true)
        setStatusText('Falta crear la tabla de crucigramas en Supabase (schema.sql).')
      }
      return
    }

    if (data) {
      setHasSolvedToday(true)
      setStatusText(`Ya resolviste el crucigrama de hoy en ${formatSeconds(data.seconds)}.`)
    } else {
      setHasSolvedToday(false)
      setStatusText(null)
    }
  }, [dateKey, session.user.id])

  useEffect(() => {
    completionStarted.current = false
    startedAt.current = null
    const timeoutId = window.setTimeout(() => {
      setElapsedSeconds(0)
      setCheckUses(0)
      setIsAnimatingCompletion(false)
      setCompletionStep(0)
      setValidationPhase('idle')
      setValidationStep(0)
      setValidationFeedbackMatrix(null)
      setActiveCell(null)
      setTypingDirection('across')
      setCells(puzzle.grid.map((row: CrosswordCell[]) => row.map((cell: CrosswordCell) => (cell.blocked ? '#' : ''))))
      setFeedback(puzzle.grid.map((row: CrosswordCell[]) => row.map((cell: CrosswordCell) => (cell.blocked ? 'none' : 'none'))))
      void Promise.all([loadMyAttempt(), refreshPodium()])
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [dateKey, loadMyAttempt, puzzle.grid, refreshPodium])

  useEffect(() => {
    if (!showGame || hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
      return
    }

    if (!startedAt.current) {
      startedAt.current = Date.now()
    }

    setElapsedSeconds((Date.now() - startedAt.current) / 1000)
    const timerId = setInterval(() => {
      if (!startedAt.current) {
        return
      }
      setElapsedSeconds((Date.now() - startedAt.current) / 1000)
    }, 250)

    return () => clearInterval(timerId)
  }, [showGame, hasSolvedToday, schemaMissing, isAnimatingCompletion, isValidationAnimating])

  const hasAllLettersPlaced = useMemo(() => {
    for (let row = 0; row < puzzle.size; row += 1) {
      for (let col = 0; col < puzzle.size; col += 1) {
        const puzzleCell = puzzle.grid[row][col]
        if (puzzleCell.blocked) {
          continue
        }
        const current = cells[row][col]
        if (!current) {
          return false
        }
      }
    }
    return true
  }, [cells, puzzle.grid, puzzle.size])

  const isAllCorrect = useMemo(() => {
    for (let row = 0; row < puzzle.size; row += 1) {
      for (let col = 0; col < puzzle.size; col += 1) {
        const puzzleCell = puzzle.grid[row][col]
        if (puzzleCell.blocked) {
          continue
        }
        const current = cells[row][col]
        if (!current || current !== puzzleCell.solution) {
          return false
        }
      }
    }
    return true
  }, [cells, puzzle.grid, puzzle.size])

  const saveSolvedAttempt = useCallback(async (seconds: number) => {
    if (schemaMissing || submitting) {
      return
    }

    setSubmitting(true)
    const { error } = await supabase
      .from('crossword_attempts')
      .insert({
        user_id: session.user.id,
        date: dateKey,
        seconds,
      })

    if (error) {
      if (error.code === '23505') {
        setStatusText('Ya tenias un tiempo registrado para hoy.')
      } else {
        const relationMissing = error.message.toLowerCase().includes('crossword_attempts')
        if (relationMissing) {
          setSchemaMissing(true)
          setStatusText('Falta crear la tabla de crucigramas en Supabase (schema.sql).')
        } else {
          setStatusText('No se pudo guardar el tiempo del crucigrama.')
        }
      }
      setSubmitting(false)
      return
    }

    setStatusText(`Crucigrama resuelto. Tiempo registrado: ${formatSeconds(seconds)}.`)
    setSubmitting(false)
    await refreshPodium()
  }, [dateKey, refreshPodium, schemaMissing, session.user.id, submitting])

  const startCompletion = useCallback(() => {
    if (completionStarted.current || hasSolvedToday || schemaMissing || isValidationAnimating) {
      return
    }

    completionStarted.current = true
    setHasSolvedToday(true)
    setActiveCell(null)
    setFeedback((previous) =>
      previous.map((line) => line.map((value) => (value === 'wrong' ? 'none' : value))),
    )

    const endMs = Date.now()
    const startMs = startedAt.current ?? endMs
    const seconds = Math.max(1, (endMs - startMs) / 1000)
    setElapsedSeconds(seconds)

    void saveSolvedAttempt(seconds)
    setIsAnimatingCompletion(true)
    setCompletionStep(0)
  }, [hasSolvedToday, isValidationAnimating, saveSolvedAttempt, schemaMissing])

  useEffect(() => {
    if (!showGame || hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
      return
    }

    if (hasAllLettersPlaced && isAllCorrect) {
      startCompletion()
    }
  }, [showGame, hasSolvedToday, schemaMissing, isAnimatingCompletion, isValidationAnimating, hasAllLettersPlaced, isAllCorrect, startCompletion])

  useEffect(() => {
    if (!isAnimatingCompletion) {
      return
    }

    if (completionStep >= answerCoords.length) {
      const timeoutId = setTimeout(() => {
        setStatusText('Completado. Volviendo al podio...')
        setIsAnimatingCompletion(false)
        onBackToPodium()
      }, 450)
      return () => clearTimeout(timeoutId)
    }

    const timeoutId = setTimeout(() => {
      setCompletionStep((previous) => previous + 1)
    }, 45)

    return () => clearTimeout(timeoutId)
  }, [isAnimatingCompletion, completionStep, answerCoords.length, onBackToPodium])

  useEffect(() => {
    if (!isValidationAnimating || !validationFeedbackMatrix) {
      return
    }

    if (validationPhase === 'reveal') {
      if (validationStep >= answerCoords.length) {
        const timeoutId = window.setTimeout(() => {
          setValidationPhase('clear')
          setValidationStep(0)
        }, 3000)

        return () => window.clearTimeout(timeoutId)
      }

      const timeoutId = window.setTimeout(() => {
        const { row, col } = answerCoords[validationStep]
        setFeedback((previous) => {
          const next = previous.map((line) => [...line])
          next[row][col] = validationFeedbackMatrix[row][col]
          return next
        })
        setValidationStep((previous) => previous + 1)
      }, 45)

      return () => window.clearTimeout(timeoutId)
    }

    if (validationPhase === 'clear') {
      if (validationStep >= answerCoords.length) {
        const timeoutId = window.setTimeout(() => {
          setValidationPhase('idle')
          setValidationStep(0)
          setValidationFeedbackMatrix(null)
        }, 0)

        return () => window.clearTimeout(timeoutId)
      }

      const timeoutId = window.setTimeout(() => {
        const { row, col } = answerCoords[validationStep]
        const currentFeedback = validationFeedbackMatrix[row][col]

        setFeedback((previous) => {
          const next = previous.map((line) => [...line])
          next[row][col] = 'none'
          return next
        })

        if (currentFeedback === 'wrong') {
          setCells((previous) => {
            const next = previous.map((line) => [...line])
            next[row][col] = ''
            return next
          })
        }

        setValidationStep((previous) => previous + 1)
      }, 45)

      return () => window.clearTimeout(timeoutId)
    }
  }, [answerCoords, isValidationAnimating, validationFeedbackMatrix, validationPhase, validationStep])

  const setCellValue = useCallback(
    (row: number, col: number, value: string) => {
      if (hasSolvedToday || isAnimatingCompletion || isValidationAnimating) {
        return
      }

      setCells((previous) => {
        const next = previous.map((line) => [...line])
        next[row][col] = value
        return next
      })

      setFeedback((previous) => {
        const next = previous.map((line) => [...line])
        if (next[row][col] !== 'none') {
          next[row][col] = 'none'
        }
        return next
      })
    },
    [hasSolvedToday, isAnimatingCompletion, isValidationAnimating],
  )

  const isCellPlayable = useCallback(
    (row: number, col: number) => {
      if (row < 0 || row >= puzzle.size || col < 0 || col >= puzzle.size) {
        return false
      }
      return !puzzle.grid[row][col].blocked
    },
    [puzzle.grid, puzzle.size],
  )

  const moveInDirection = useCallback(
    (fromRow: number, fromCol: number, direction: TypingDirection, step: 1 | -1): ActiveCell => {
      const rowDelta = direction === 'down' ? step : 0
      const colDelta = direction === 'across' ? step : 0
      let nextRow = fromRow + rowDelta
      let nextCol = fromCol + colDelta

      while (nextRow >= 0 && nextRow < puzzle.size && nextCol >= 0 && nextCol < puzzle.size) {
        if (isCellPlayable(nextRow, nextCol)) {
          return { row: nextRow, col: nextCol }
        }
        nextRow += rowDelta
        nextCol += colDelta
      }

      return null
    },
    [isCellPlayable, puzzle.size],
  )

  const moveInLine = useCallback(
    (fromRow: number, fromCol: number, rowDelta: number, colDelta: number): ActiveCell => {
      let nextRow = fromRow + rowDelta
      let nextCol = fromCol + colDelta

      while (nextRow >= 0 && nextRow < puzzle.size && nextCol >= 0 && nextCol < puzzle.size) {
        if (isCellPlayable(nextRow, nextCol)) {
          return { row: nextRow, col: nextCol }
        }
        nextRow += rowDelta
        nextCol += colDelta
      }

      return null
    },
    [isCellPlayable, puzzle.size],
  )

  const placeLetter = useCallback(
    (
      row: number,
      col: number,
      letter: string | null,
      options: { moveForward?: boolean } = {},
    ) => {
      if (schemaMissing || hasSolvedToday || isAnimatingCompletion || isValidationAnimating || puzzle.grid[row][col].blocked) {
        return
      }

      if (!letter) {
        setCellValue(row, col, '')
        return
      }

      const normalized = letter
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 1)

      if (!normalized) {
        return
      }

      setCellValue(row, col, normalized)

      if (options.moveForward === false) {
        return
      }

      const next = moveInDirection(row, col, typingDirection, 1)
      if (next) {
        setActiveCell(next)
      }
    },
    [hasSolvedToday, isAnimatingCompletion, isValidationAnimating, moveInDirection, puzzle.grid, schemaMissing, setCellValue, typingDirection],
  )

  useEffect(() => {
    if (!showGame || schemaMissing || hasSolvedToday || isAnimatingCompletion || isValidationAnimating) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tagName = target.tagName
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable) {
          return
        }
      }

      if (!activeCell) {
        return
      }

      const { row, col } = activeCell

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setTypingDirection('across')
        const previous = moveInLine(row, col, 0, -1)
        if (previous) {
          setActiveCell(previous)
        }
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setTypingDirection('across')
        const next = moveInLine(row, col, 0, 1)
        if (next) {
          setActiveCell(next)
        }
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setTypingDirection('down')
        const previous = moveInLine(row, col, -1, 0)
        if (previous) {
          setActiveCell(previous)
        }
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setTypingDirection('down')
        const next = moveInLine(row, col, 1, 0)
        if (next) {
          setActiveCell(next)
        }
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        const step: 1 | -1 = event.shiftKey ? -1 : 1
        const next = moveInDirection(row, col, typingDirection, step)
        if (next) {
          setActiveCell(next)
        }
        return
      }

      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        setTypingDirection((previous) => (previous === 'across' ? 'down' : 'across'))
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        const currentValue = cells[row][col]
        if (currentValue) {
          placeLetter(row, col, null, { moveForward: false })
          return
        }

        const previous = moveInDirection(row, col, typingDirection, -1)
        if (!previous) {
          return
        }

        placeLetter(previous.row, previous.col, null, { moveForward: false })
        setActiveCell(previous)
        return
      }

      if (event.key === 'Delete') {
        event.preventDefault()
        placeLetter(row, col, null, { moveForward: false })
        return
      }

      const normalized = event.key
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 1)

      if (!normalized) {
        return
      }

      event.preventDefault()
      placeLetter(row, col, normalized)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    activeCell,
    cells,
    hasSolvedToday,
    isAnimatingCompletion,
    isValidationAnimating,
    moveInDirection,
    moveInLine,
    placeLetter,
    schemaMissing,
    showGame,
    typingDirection,
  ])

  const onCellTap = (row: number, col: number) => {
    if (!isCellPlayable(row, col) || schemaMissing || hasSolvedToday || isAnimatingCompletion || isValidationAnimating) {
      return
    }

    const sameCell = activeCell?.row === row && activeCell?.col === col
    setActiveCell({ row, col })
    setTypingDirection(sameCell ? 'down' : 'across')
    window.setTimeout(() => {
      focusMobileInput()
    }, 0)
  }

  const onCellPointerDown = (event: React.PointerEvent<HTMLButtonElement>, row: number, col: number) => {
    if (!isCellPlayable(row, col) || hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
      return
    }

    event.preventDefault()
    onCellTap(row, col)
  }

  const handleMobileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeCell || hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
      event.currentTarget.value = ''
      return
    }

    const rawValue = event.currentTarget.value
    event.currentTarget.value = ''

    if (!rawValue) {
      return
    }

    const { row, col } = activeCell
    const firstChar = rawValue
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 1)

    if (!firstChar) {
      return
    }

    placeLetter(row, col, firstChar)
  }

  const handleMobileInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Backspace') {
      return
    }

    if (!activeCell) {
      return
    }

    const { row, col } = activeCell
    const currentValue = cells[row][col]
    if (currentValue) {
      event.preventDefault()
      placeLetter(row, col, null, { moveForward: false })
      return
    }
  }

  const getCellDisplay = (row: number, col: number): string => {
    const value = cells[row][col]
    if (value === '#') {
      return ''
    }
    return value
  }

  const isCellActive = (row: number, col: number): boolean =>
    activeCell?.row === row && activeCell?.col === col

  const isCellInActiveLine = (row: number, col: number): boolean => {
    if (!activeCell) {
      return false
    }

    if (typingDirection === 'across') {
      return activeCell.row === row
    }

    return activeCell.col === col
  }

  const podiumDisplay = podium
  const rankBadgeByIndex = [
    { src: goldMedal, alt: 'Medalla de oro' },
    { src: silverMedal, alt: 'Medalla de plata' },
    { src: bronzeMedal, alt: 'Medalla de bronce' },
  ]

  const handleCheck = () => {
    if (hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating || checkUses >= MAX_CHECKS) {
      return
    }

    setCheckUses((previous) => previous + 1)

    const validationMatrix = puzzle.grid.map((row: CrosswordCell[], rowIndex: number) =>
      row.map((cell: CrosswordCell, colIndex: number) => {
        if (cell.blocked) {
          return 'none'
        }

        const value = cells[rowIndex][colIndex]
        if (!value) {
          return 'none'
        }

        return value === cell.solution ? 'correct' : 'wrong'
      }),
    )

    setValidationFeedbackMatrix(validationMatrix)
    setValidationPhase('reveal')
    setValidationStep(0)
    setFeedback(puzzle.grid.map((row: CrosswordCell[]) => row.map((cell: CrosswordCell) => (cell.blocked ? 'none' : 'none'))))

    if (checkUses + 1 >= MAX_CHECKS) {
      setStatusText('Sin usos de comprobar. Completa el crucigrama para terminar.')
    }
  }

  if (!showGame) {
    return (
      <section className="rounded-3xl border border-zinc-900/10 bg-white/85 p-4 shadow-lg backdrop-blur sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-black text-zinc-900 sm:text-2xl">Podio Crucigrama Diario</h2>
          </div>
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">{dateKey}</p>
        </div>

        {statusText && (
          <p className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">{statusText}</p>
        )}

        <div className="space-y-2">
          {podiumDisplay.map((entry, index) => {
            const rank = index + 1
            const badge = rankBadgeByIndex[index]

            return (
              <article
                key={`crossword-podium-${rank}`}
                className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {badge ? (
                    <img src={badge.src} alt={badge.alt} className="h-8 w-8 object-contain sm:h-10 sm:w-10" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-600 text-xs font-black text-zinc-300 sm:h-10 sm:w-10 sm:text-sm">
                      {rank}
                    </div>
                  )}
                  <p className="truncate text-sm font-black text-zinc-100 sm:text-base">
                    {entry ? entry.username : 'Sin tiempo'}
                  </p>
                </div>

                <p className="text-sm font-black text-emerald-300 sm:text-base">
                  {entry ? formatSeconds(entry.seconds) : '--:--'}
                </p>
              </article>
            )
          })}
        </div>

        {schemaMissing && (
          <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            Activa la tabla crossword_attempts para ver y guardar tiempos.
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/85 p-4 shadow-lg backdrop-blur sm:p-6">
      <input
        ref={mobileInputRef}
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="done"
        onChange={handleMobileInputChange}
        onKeyDown={handleMobileInputKeyDown}
        className="fixed left-0 top-0 h-px w-px opacity-0 pointer-events-none"
      />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-black text-zinc-900 sm:text-2xl">Crucigrama Diario</h2>
          <p className="text-sm text-zinc-600">Tamano {puzzle.size}x{puzzle.size}. Resuelve todo para completar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">Tiempo: {formatSeconds(elapsedSeconds)}</p>
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">{dateKey}</p>
          <button
            type="button"
            onClick={handleCheck}
            disabled={hasSolvedToday || schemaMissing || isAnimatingCompletion || checkUses >= MAX_CHECKS}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Comprobar ({Math.max(0, MAX_CHECKS - checkUses)}/{MAX_CHECKS})
          </button>
          <button
            type="button"
            onClick={onBackToPodium}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
          >
            Volver al podio
          </button>
        </div>
      </div>

      {statusText && (
        <p className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">{statusText}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-2">
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-2">
            
            <p className="mt-1 text-xs text-zinc-500">
              Direccion actual: <span className="font-bold">{typingDirection === 'across' ? 'Horizontal' : 'Vertical'}</span>
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-2">
            <div
              className="mx-auto grid aspect-square w-full max-w-[420px] gap-[2px]"
              style={{
                gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${puzzle.size}, minmax(0, 1fr))`,
              }}
            >
              {puzzle.grid.map((row: CrosswordCell[], rowIndex: number) =>
                row.map((cell: CrosswordCell, colIndex: number) => {
                  if (cell.blocked) {
                    return <div key={`${rowIndex}-${colIndex}`} className="aspect-square rounded-[4px] bg-zinc-900" />
                  }

                  return (
                    <button
                      key={`${rowIndex}-${colIndex}`}
                      type="button"
                      data-crossword-cell="true"
                      data-row={rowIndex}
                      data-col={colIndex}
                      onFocus={() => onCellTap(rowIndex, colIndex)}
                      onPointerDown={(event) => {
                        onCellPointerDown(event, rowIndex, colIndex)
                      }}
                      onClick={(event) => {
                        if (event.detail === 0) {
                          onCellTap(rowIndex, colIndex)
                        }
                      }}
                      disabled={hasSolvedToday || schemaMissing || isAnimatingCompletion}
                      className={`relative aspect-square rounded-[4px] border text-center text-sm font-black uppercase text-zinc-900 outline-none transition ${(() => {
                        const animationIndex = animationOrderByCell.get(`${rowIndex}-${colIndex}`)
                        if (typeof animationIndex === 'number' && animationIndex < completionStep) {
                          return 'border-emerald-600 bg-emerald-200 text-emerald-900'
                        }

                        const state = feedback[rowIndex][colIndex]
                        if (state === 'correct') {
                          return 'border-emerald-500 bg-emerald-100 text-emerald-900'
                        }
                        if (state === 'wrong') {
                          return 'border-rose-500 bg-rose-100 text-rose-900'
                        }
                        if (isCellActive(rowIndex, colIndex)) {
                          return 'border-zinc-900 bg-zinc-100 ring-2 ring-zinc-400'
                        }

                        if (isCellInActiveLine(rowIndex, colIndex)) {
                          return 'border-zinc-400 bg-zinc-100/80'
                        }

                        return 'border-zinc-300 bg-white'
                      })()}`}
                    >
                      {cell.number ? (
                        <span className="absolute left-0.5 top-0 z-10 text-[9px] font-bold leading-none text-zinc-500">{cell.number}</span>
                      ) : null}
                      <span>{getCellDisplay(rowIndex, colIndex)}</span>
                    </button>
                  )
                }),
              )}
            </div>
          </div>

        </div>

        <div className="space-y-4">
          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Horizontales</h3>
            <ul className="mt-2 max-h-52 space-y-2 overflow-auto pr-1 text-sm text-zinc-700">
              {puzzle.cluesAcross.map((clue: CrosswordClue) => (
                <li key={`A-${clue.number}-${clue.row}-${clue.col}-${clue.answer}`}>
                  <span className="font-bold">{clue.number}.</span> {clue.clue}
                </li>
              ))}
            </ul>
          </article>

          {puzzle.cluesDown.length > 0 && (
            <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Verticales</h3>
              <ul className="mt-2 max-h-52 space-y-2 overflow-auto pr-1 text-sm text-zinc-700">
                {puzzle.cluesDown.map((clue: CrosswordClue) => (
                  <li key={`D-${clue.number}-${clue.row}-${clue.col}-${clue.answer}`}>
                    <span className="font-bold">{clue.number}.</span> {clue.clue}
                  </li>
                ))}
              </ul>
            </article>
          )}

        </div>
      </div>
    </section>
  )
}
