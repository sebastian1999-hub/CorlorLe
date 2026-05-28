import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { buildDailyCrossword, type CrosswordCell, type CrosswordClue } from '../lib/crossword.ts'
import { supabase } from '../lib/supabase'

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

const MAX_CHECKS = 2

const formatSeconds = (value: number): string => {
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function CrosswordTab({ session, dateKey, showGame, onBackToPodium }: CrosswordTabProps) {
  const puzzle = useMemo(() => buildDailyCrossword(dateKey), [dateKey])
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
  const [loadingPodium, setLoadingPodium] = useState(true)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [hasSolvedToday, setHasSolvedToday] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [checkUses, setCheckUses] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isAnimatingCompletion, setIsAnimatingCompletion] = useState(false)
  const [completionStep, setCompletionStep] = useState(0)
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

  const refreshPodium = useCallback(async () => {
    setLoadingPodium(true)

    const { data, error } = await supabase
      .from('crossword_attempts')
      .select('user_id,seconds')
      .eq('date', dateKey)
      .order('seconds', { ascending: true })
      .limit(3)

    if (error) {
      const relationMissing = error.message.toLowerCase().includes('crossword_attempts')
      if (relationMissing) {
        setSchemaMissing(true)
      }
      setLoadingPodium(false)
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
    setLoadingPodium(false)
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
    if (!showGame || hasSolvedToday || schemaMissing || isAnimatingCompletion) {
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
  }, [showGame, hasSolvedToday, schemaMissing, isAnimatingCompletion])

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
    if (completionStarted.current || hasSolvedToday || schemaMissing) {
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
  }, [hasSolvedToday, saveSolvedAttempt, schemaMissing])

  useEffect(() => {
    if (!showGame || hasSolvedToday || schemaMissing || isAnimatingCompletion) {
      return
    }

    if (hasAllLettersPlaced && isAllCorrect) {
      startCompletion()
    }
  }, [showGame, hasSolvedToday, schemaMissing, isAnimatingCompletion, hasAllLettersPlaced, isAllCorrect, startCompletion])

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

  const setCellValue = (row: number, col: number, value: string) => {
    if (hasSolvedToday || isAnimatingCompletion) {
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
  }

  const placeLetter = (row: number, col: number, letter: string | null) => {
    if (schemaMissing || hasSolvedToday || isAnimatingCompletion || puzzle.grid[row][col].blocked) {
      return
    }

    if (!letter) {
      setCellValue(row, col, '')
      return
    }

    setCellValue(row, col, letter.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1))
  }

  const handleDropLetter = (row: number, col: number, value: string | null) => {
    if (!value) {
      return
    }
    if (value === '__CLEAR__') {
      placeLetter(row, col, null)
      return
    }
    placeLetter(row, col, value)
  }

  const startDragLetter = (letter: string) => {
    if (hasSolvedToday || schemaMissing || isAnimatingCompletion) {
      return
    }
    setDraggingLetter(letter)
    selectedLetterRef.current = letter
    setSelectedLetter(letter)
  }

  const selectLetter = (letter: string) => {
    if (hasSolvedToday || schemaMissing || isAnimatingCompletion) {
      return
    }

    const nextLetter = selectedLetterRef.current === letter ? null : letter
    selectedLetterRef.current = nextLetter
    setSelectedLetter(nextLetter)
  }

  const endDragLetter = () => {
    setDraggingLetter(null)
  }

  const onCellTap = (row: number, col: number) => {
    const currentSelectedLetter = selectedLetterRef.current
    if (!currentSelectedLetter) {
      return
    }

    handleDropLetter(row, col, currentSelectedLetter)

    if (currentSelectedLetter === '__CLEAR__') {
      return
    }

    if (!hasSolvedToday && !schemaMissing) {
      selectedLetterRef.current = null
      setSelectedLetter(null)
    }
  }

  const onCellPointerDown = (event: React.PointerEvent<HTMLButtonElement>, row: number, col: number) => {
    if (!selectedLetter || hasSolvedToday || schemaMissing || isAnimatingCompletion) {
      return
    }

    event.preventDefault()
    onCellTap(row, col)
  }

  const renderTile = (letter: string) => {
    const isActive = selectedLetter === letter

    return (
      <button
        key={letter}
        type="button"
        draggable={!hasSolvedToday && !schemaMissing}
        onDragStart={(event) => {
          startDragLetter(letter)
          event.dataTransfer.setData('text/plain', letter)
        }}
        onDragEnd={endDragLetter}
        onPointerDown={() => selectLetter(letter)}
        onClick={() => {
          if (hasSolvedToday || schemaMissing || isAnimatingCompletion) {
            return
          }
          selectLetter(letter)
        }}
        disabled={hasSolvedToday || schemaMissing || isAnimatingCompletion}
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
    return [...letterPool, '__CLEAR__']
  }, [letterPool])
  
  const mobileTileSplit = useMemo(() => {
    const midpoint = Math.ceil(carouselTiles.length / 2)
    return {
      top: carouselTiles.slice(0, midpoint),
      bottom: carouselTiles.slice(midpoint),
    }
  }, [carouselTiles])

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

  const podiumDisplay = [podium[1], podium[0], podium[2]]

  const handleCheck = () => {
    if (hasSolvedToday || schemaMissing || isAnimatingCompletion || checkUses >= MAX_CHECKS) {
      return
    }

    setCheckUses((previous) => previous + 1)

    setFeedback(
      puzzle.grid.map((row: CrosswordCell[], rowIndex: number) =>
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
      ),
    )

    if (hasAllLettersPlaced && isAllCorrect) {
      startCompletion()
      return
    }

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

        <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
          {podiumDisplay.map((entry, index) => {
            const rank = index === 0 ? 2 : index === 1 ? 1 : 3
            return (
              <article
                key={`crossword-podium-${rank}`}
                className={`rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm sm:p-3 ${rank === 1 ? '-translate-y-2 sm:-translate-y-3' : ''}`}
              >
                {entry ? (
                  <>
                    <p className="truncate text-xs font-black text-zinc-900 sm:text-base">#{rank} {entry.username}</p>
                    <p className="mt-2 text-base font-black text-emerald-700 sm:text-lg">{formatSeconds(entry.seconds)}</p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">#{rank} Sin tiempo</p>
                )}
                <div className={`mt-3 rounded-xl bg-zinc-100 ${rank === 1 ? 'h-20' : rank === 2 ? 'h-14' : 'h-10'}`} />
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
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-2 sm:hidden">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Letras (arrastra el carrusel y toca para seleccionar)</p>
            <div className="overflow-x-auto">
              <div className="flex w-max snap-x snap-mandatory gap-2 px-1 pb-1">
                {mobileTileSplit.top.map((letter, index) => (
                  <div key={`tile-top-${letter}-${index}`} className="snap-center">
                    {renderTile(letter)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden rounded-xl border border-dashed border-zinc-200 bg-white p-2 sm:block">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Letras (arrastra el carrusel y toca para seleccionar)</p>
            <div className="overflow-x-auto">
              <div className="flex w-max snap-x snap-mandatory gap-2 px-1 pb-1">
                {carouselTiles.map((letter, index) => (
                  <div key={`tile-desktop-${letter}-${index}`} className="snap-center">
                    {renderTile(letter)}
                  </div>
                ))}
              </div>
            </div>
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
                      onClick={() => onCellTap(rowIndex, colIndex)}
                      onDragOver={(event) => {
                        if (hasSolvedToday || schemaMissing || isAnimatingCompletion) {
                          return
                        }
                        event.preventDefault()
                      }}
                      onDrop={(event) => {
                        if (hasSolvedToday || schemaMissing || isAnimatingCompletion) {
                          return
                        }
                        event.preventDefault()
                        const letter = event.dataTransfer.getData('text/plain') || draggingLetter
                        handleDropLetter(rowIndex, colIndex, letter)
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

          <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-2 sm:hidden">
            <div className="overflow-x-auto">
              <div className="flex w-max snap-x snap-mandatory gap-2 px-1 pb-1">
                {mobileTileSplit.bottom.map((letter, index) => (
                  <div key={`tile-bottom-${letter}-${index}`} className="snap-center">
                    {renderTile(letter)}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        <div className="space-y-4">
          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Horizontales</h3>
            <ul className="mt-2 max-h-52 space-y-2 overflow-auto pr-1 text-sm text-zinc-700">
              {puzzle.cluesAcross.map((clue: CrosswordClue) => (
                <li key={`A-${clue.number}-${clue.row}-${clue.col}-${clue.answer}`}>
                  <span className="font-bold">{clue.number}.</span> {clue.clue} ({clue.answer})
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
                    <span className="font-bold">{clue.number}.</span> {clue.clue} ({clue.answer})
                  </li>
                ))}
              </ul>
            </article>
          )}

          <article className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Podio por tiempo</h3>
              {loadingPodium && <span className="text-xs text-zinc-500">Cargando...</span>}
            </div>

            {schemaMissing ? (
              <p className="text-sm text-zinc-600">Activa la tabla `crossword_attempts` para ver el podio.</p>
            ) : podium.length === 0 ? (
              <p className="text-sm text-zinc-600">Todavia no hay tiempos registrados.</p>
            ) : (
              <div className="space-y-2">
                {podium.map((entry, index) => (
                  <div key={entry.userId} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <p className="text-sm font-semibold text-zinc-800">#{index + 1} {entry.username}</p>
                    <p className="text-sm font-black text-emerald-700">{formatSeconds(entry.seconds)}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  )
}
