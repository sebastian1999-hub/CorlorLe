import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { buildDailyCrossword, buildDailyCrosswordFromWordList, type CrosswordCell } from '../lib/crossword.ts'
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
type ValidationPhase = 'idle' | 'reveal' | 'clear'

type DictionaryRow = {
  word: string
  clue: string
}

const MAX_CHECKS = 2
// Increment this value when you want to regenerate the global daily crossword for everyone.
const CROSSWORD_DAILY_REVISION = '2026-06-01-r2'

const normalizeToken = (value: string): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')

const normalizeDictionaryClue = (value: string, normalizedWord: string): string | null => {
  let clue = String(value || '').replace(/\s+/g, ' ').trim()
  if (!clue) {
    return null
  }

  // Remove common prefixed numbering or punctuation noise.
  clue = clue.replace(/^[\d\s.)\-–—]+/, '')

  // Remove common leading RAE grammatical abbreviations (adj., m., f., tr., etc.).
  clue = clue.replace(/^(?:(?:adj|adv|m|f|s|tr|intr|prnl|loc|conj|interj|prep|pron|art|num|sust)\.\s*)+/i, '')

  clue = clue
    .replace(/[;:]+/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/^[,.;:\-–—\s]+|[,.;:\-–—\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!clue || clue.length < 12 || clue.length > 180) {
    return null
  }

  const words = clue.split(' ').filter(Boolean)
  if (words.length < 2) {
    return null
  }

  const letterCount = (clue.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) ?? []).length
  if (letterCount / clue.length < 0.6) {
    return null
  }

  const normalizedClue = normalizeToken(clue)
  if (!normalizedClue || normalizedClue.includes(normalizedWord)) {
    return null
  }

  return clue.charAt(0).toUpperCase() + clue.slice(1)
}

const formatSeconds = (value: number): string => {
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function CrosswordTab({ session, dateKey, showGame, onBackToPodium }: CrosswordTabProps) {
  const [remoteDictionary, setRemoteDictionary] = useState<DictionaryRow[]>([])

  const deterministicRemoteDictionary = useMemo(() => {
    const dedupByWord = new Map<string, DictionaryRow>()
    for (const row of remoteDictionary) {
      const key = String(row.word || '').trim().toUpperCase()
      if (!/^[A-Z]{3,11}$/.test(key) || dedupByWord.has(key)) {
        continue
      }

      const normalizedClue = normalizeDictionaryClue(String(row.clue || ''), key)
      if (!normalizedClue) {
        continue
      }

      dedupByWord.set(key, {
        word: key,
        clue: normalizedClue,
      })
    }

    return [...dedupByWord.values()].sort((a, b) => a.word.localeCompare(b.word))
  }, [remoteDictionary])

  useEffect(() => {
    let isMounted = true

    const loadDictionary = async () => {
      const { data, error } = await supabase
        .from('crossword_dictionary')
        .select('word,clue')
        .eq('is_active', true)
        .order('word', { ascending: true })
        .limit(5000)

      if (!isMounted) {
        return
      }

      if (error) {
        setRemoteDictionary([])
        return
      }

      const rows = (data ?? []) as DictionaryRow[]
      setRemoteDictionary(rows)
    }

    void loadDictionary()

    return () => {
      isMounted = false
    }
  }, [])

  const puzzle = useMemo(() => {
    if (deterministicRemoteDictionary.length >= 24) {
      const versionedDateKey = `${dateKey}-global-${CROSSWORD_DAILY_REVISION}`
      return buildDailyCrosswordFromWordList(versionedDateKey, deterministicRemoteDictionary)
    }
    return buildDailyCrossword(dateKey)
  }, [dateKey, deterministicRemoteDictionary])
  const letterPool = useMemo(() => {
    const letters = new Set<string>()
    for (const row of puzzle.grid) {
      for (const cell of row) {
        if (!cell.blocked && cell.solution) {
          letters.add(cell.solution)
        }
      }
    }
    return [...letters].sort()
  }, [puzzle.grid])
  const [cells, setCells] = useState<string[][]>(() =>
    puzzle.grid.map((row: CrosswordCell[]) => row.map((cell: CrosswordCell) => (cell.blocked ? '#' : ''))),
  )
  const [feedback, setFeedback] = useState<CellFeedback[][]>(() =>
    puzzle.grid.map((row: CrosswordCell[]) => row.map((cell: CrosswordCell) => (cell.blocked ? 'none' : 'none'))),
  )
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null)
  const [draggingLetter, setDraggingLetter] = useState<string | null>(null)
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
  const selectedLetterRef = useRef<string | null>(null)

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

  const cluesAcrossUnique = useMemo(() => {
    const sorted = [...puzzle.cluesAcross].sort((a, b) => a.number - b.number || a.row - b.row || a.col - b.col)
    const seen = new Set<number>()
    return sorted.filter((clue) => {
      if (seen.has(clue.number)) {
        return false
      }
      seen.add(clue.number)
      return true
    })
  }, [puzzle.cluesAcross])

  const cluesDownUnique = useMemo(() => {
    const sorted = [...puzzle.cluesDown].sort((a, b) => a.number - b.number || a.row - b.row || a.col - b.col)
    const seen = new Set<number>()
    return sorted.filter((clue) => {
      if (seen.has(clue.number)) {
        return false
      }
      seen.add(clue.number)
      return true
    })
  }, [puzzle.cluesDown])

  const isValidationAnimating = validationPhase !== 'idle'

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
      setSelectedLetter(null)
      selectedLetterRef.current = null
      setDraggingLetter(null)
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
    setSelectedLetter(null)
    selectedLetterRef.current = null
    setDraggingLetter(null)
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

  const placeLetter = useCallback(
    (row: number, col: number, letter: string | null) => {
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
    },
    [hasSolvedToday, isAnimatingCompletion, isValidationAnimating, puzzle.grid, schemaMissing, setCellValue],
  )

  const onCellTap = (row: number, col: number) => {
    const currentSelectedLetter = selectedLetterRef.current
    if (!currentSelectedLetter || schemaMissing || hasSolvedToday || isAnimatingCompletion || isValidationAnimating) {
      return
    }

    if (currentSelectedLetter === '__CLEAR__') {
      placeLetter(row, col, null)
      return
    }

    placeLetter(row, col, currentSelectedLetter)
  }

  const onCellPointerDown = (event: React.PointerEvent<HTMLButtonElement>, row: number, col: number) => {
    if (!selectedLetter || hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
      return
    }

    event.preventDefault()
    onCellTap(row, col)
  }

  const startDragLetter = (letter: string) => {
    if (hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
      return
    }
    setDraggingLetter(letter)
    selectedLetterRef.current = letter
    setSelectedLetter(letter)
  }

  const selectLetter = (letter: string) => {
    if (hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
      return
    }

    const nextLetter = selectedLetterRef.current === letter ? null : letter
    selectedLetterRef.current = nextLetter
    setSelectedLetter(nextLetter)
  }

  const endDragLetter = () => {
    setDraggingLetter(null)
  }

  const renderTile = (letter: string) => {
    const isActive = selectedLetter === letter

    return (
      <button
        key={letter}
        type="button"
        draggable={false}
        onDragStart={(event) => {
          startDragLetter(letter)
          event.dataTransfer.setData('text/plain', letter)
        }}
        onDragEnd={endDragLetter}
        onPointerDown={() => selectLetter(letter)}
        onClick={(event) => {
          if (event.detail === 0) {
            selectLetter(letter)
          }
        }}
        disabled={hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating}
        className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-black shadow-sm transition sm:h-11 sm:w-11 ${
          isActive
            ? 'border-zinc-900 bg-zinc-900 text-white'
            : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {letter === '__CLEAR__' ? '⌫' : letter}
      </button>
    )
  }

  const carouselTiles = useMemo(() => {
    const fallbackLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const baseLetters = letterPool.length > 0 ? letterPool : fallbackLetters
    return [...baseLetters, '__CLEAR__']
  }, [letterPool])

  const getCellDisplay = (row: number, col: number): string => {
    const value = cells[row][col]
    if (value === '#') {
      return ''
    }
    return value
  }

  const canShowCellHint = (row: number, col: number): boolean => {
    if (!selectedLetter || selectedLetter === '__CLEAR__') {
      return false
    }

    if (puzzle.grid[row][col].blocked) {
      return false
    }

    return !getCellDisplay(row, col)
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Letras (arrastra el carrusel y toca para seleccionar)</p>
            <div className="overflow-x-auto">
              <div className="flex w-max snap-x snap-mandatory gap-2 px-1 pb-1">
                {carouselTiles.map((letter, index) => (
                  <div key={`tile-${letter}-${index}`} className="snap-center">
                    {renderTile(letter)}
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {selectedLetter
                ? `Seleccionada: ${selectedLetter === '__CLEAR__' ? 'Borrar' : selectedLetter}`
                : 'Selecciona una letra para colocarla en el tablero.'}
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
                      onPointerDown={(event) => onCellPointerDown(event, rowIndex, colIndex)}
                      onClick={(event) => {
                        if (event.detail === 0) {
                          onCellTap(rowIndex, colIndex)
                        }
                      }}
                      onDragOver={(event) => {
                        if (hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
                          return
                        }
                        event.preventDefault()
                      }}
                      onDrop={(event) => {
                        if (hasSolvedToday || schemaMissing || isAnimatingCompletion || isValidationAnimating) {
                          return
                        }
                        event.preventDefault()
                        const letter = event.dataTransfer.getData('text/plain') || draggingLetter
                        if (!letter) {
                          return
                        }
                        if (letter === '__CLEAR__') {
                          placeLetter(rowIndex, colIndex, null)
                        } else {
                          placeLetter(rowIndex, colIndex, letter)
                        }
                        setDraggingLetter(null)
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
                        return canShowCellHint(rowIndex, colIndex)
                          ? 'border-zinc-500 bg-zinc-100'
                          : 'border-zinc-300 bg-white'
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
            <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Filas</h3>
            <ul className="mt-2 max-h-[28rem] space-y-2 overflow-auto pr-1 text-sm text-zinc-700">
              {cluesAcrossUnique.map((clue, index) => (
                <li key={`A-${clue.number}-${index}`}>
                  <span className="font-bold">{clue.number}.</span> {clue.clue}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Columnas</h3>
            <ul className="mt-2 max-h-[28rem] space-y-2 overflow-auto pr-1 text-sm text-zinc-700">
              {cluesDownUnique.map((clue, index) => (
                <li key={`D-${clue.number}-${index}`}>
                  <span className="font-bold">{clue.number}.</span> {clue.clue}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  )
}
