
import { Fragment, useMemo, useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { hexToRgb, rgbToHex } from '../lib/colorMath'
import tapSoundSrc from '../assets/crucigama-sounds/tap.wav'
import selectSoundSrc from '../assets/crucigama-sounds/select.wav'
import paintSoundSrc from '../assets/crucigama-sounds/paint.wav'
import correctSoundSrc from '../assets/crucigama-sounds/correct.wav'
import flipSoundSrc from '../assets/crucigama-sounds/flip.wav'
import completeSoundSrc from '../assets/crucigama-sounds/complete.wav'

type ColorFusionTabProps = {
  dateKey: string
  showGame: boolean
}

type Target =
  | { type: 'row'; index: number }
  | { type: 'col'; index: number }

type FusionPuzzle = {
  size: number
  clues: Map<string, string>
  solvedRows: string[]
  solvedCols: string[]
}

//
const CRUCIGAMA_LABEL = 'CruciGama'
const CRUCIGAMA_GRADIENT = ['#F97316', '#FB923C', '#FACC15', '#84CC16', '#22C55E', '#06B6D4', '#3B82F6', '#6366F1', '#A855F7']

type PaletteOption = {
  hex: string
  group: string
}

const PALETTE_OPTIONS: PaletteOption[] = [
  { hex: '#1E1E1E', group: 'Neutros' },
  { hex: '#E0E0E0', group: 'Neutros' },

  { hex: '#C00000', group: 'Rojos' },
  { hex: '#EF9A9A', group: 'Rojos' },

  { hex: '#E65100', group: 'Naranjas' },
  { hex: '#FFCC80', group: 'Naranjas' },

  { hex: '#2E7D32', group: 'Verdes' },
  { hex: '#A5D6A7', group: 'Verdes' },

  { hex: '#0D47A1', group: 'Azules' },
  { hex: '#90CAF9', group: 'Azules' },

  { hex: '#5B4788', group: 'Morados' },
  { hex: '#B493C4', group: 'Morados' },
]

const INTRO_PALETTE_PREVIEW = [
  '#1E1E1E', '#C00000', '#E65100', '#2E7D32', '#0D47A1', '#5B4788',
  '#E0E0E0', '#EF9A9A', '#FFCC80', '#A5D6A7', '#90CAF9', '#B493C4',
]

const INTRO_COLUMN_SELECTOR_COLORS = ['#1E1E1E', '#C00000', '#E65100', '#2E7D32', '#0D47A1']
const INTRO_ROW_SELECTOR_COLORS = ['#E0E0E0', '#EF9A9A', '#FFCC80', '#A5D6A7', '#90CAF9']

const PALETTE_HEX = PALETTE_OPTIONS.map((entry) => entry.hex)

const CONFETTI_COLORS = [
  '#F472B6', '#F87171', '#34D399', '#FBBF24', '#60A5FA', '#A3E635', '#F43F5E', '#F59E42', '#10B981',
]

const SOUND_SOURCES = {
  tap: tapSoundSrc,
  select: selectSoundSrc,
  paint: paintSoundSrc,
  correct: correctSoundSrc,
  flip: flipSoundSrc,
  complete: completeSoundSrc,
} as const

type SoundName = keyof typeof SOUND_SOURCES

const hashDate = (value: string): number => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const createRng = (seed: number): (() => number) => {
  let t = seed + 0x6d2b79f5
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pickFrom = <T,>(items: T[], rng: () => number): T => {
  const index = Math.floor(rng() * items.length)
  return items[Math.max(0, Math.min(items.length - 1, index))]
}

const mixColors = (a: string, b: string): string => {
  const rgbA = hexToRgb(a)
  const rgbB = hexToRgb(b)
  return rgbToHex({
    r: Math.round((rgbA.r + rgbB.r) / 2),
    g: Math.round((rgbA.g + rgbB.g) / 2),
    b: Math.round((rgbA.b + rgbB.b) / 2),
  })
}

const cellKey = (row: number, col: number): string => `${row}-${col}`

const placeClue = (
  row: number,
  col: number,
  clues: Map<string, string>,
  rowCounts: number[],
  colCounts: number[],
): boolean => {
  const key = cellKey(row, col)
  if (clues.has(key)) {
    return false
  }
  if (rowCounts[row] >= 2 || colCounts[col] >= 2) {
    return false
  }

  clues.set(key, '')
  rowCounts[row] += 1
  colCounts[col] += 1
  return true
}

const buildDailyPuzzle = (dateKey: string): FusionPuzzle => {
  const size = 5
  const rng = createRng(hashDate(`fusion-${dateKey}`))

  const solvedRows = Array.from({ length: size }, () => pickFrom(PALETTE_HEX, rng))
  const solvedCols = Array.from({ length: size }, () => pickFrom(PALETTE_HEX, rng))

  const clues = new Map<string, string>()

  const rowCounts = Array.from({ length: size }, () => 0)
  const colCounts = Array.from({ length: size }, () => 0)

  // Ensure every row has at least one clue.
  for (let row = 0; row < size; row += 1) {
    const colOrder = Array.from({ length: size }, (_, i) => i).sort(() => rng() - 0.5)
    const availableCols = colOrder.filter((col) => colCounts[col] < 2)
    const targetCol = availableCols.length > 0
      ? availableCols.reduce((best, col) => (colCounts[col] < colCounts[best] ? col : best), availableCols[0])
      : colOrder[0]
    placeClue(row, targetCol, clues, rowCounts, colCounts)
  }

  // Ensure every column has at least one clue.
  for (let col = 0; col < size; col += 1) {
    if (colCounts[col] > 0) {
      continue
    }

    const rowOrder = Array.from({ length: size }, (_, i) => i).sort(() => rng() - 0.5)
    const candidateRows = rowOrder.filter((row) => rowCounts[row] < 2)
    if (candidateRows.length === 0) {
      continue
    }

    const targetRow = candidateRows.reduce((best, row) => (rowCounts[row] < rowCounts[best] ? row : best), candidateRows[0])
    placeClue(targetRow, col, clues, rowCounts, colCounts)
  }

  // Add a few extra clues while respecting max 2 clues per row/column.
  const targetClues = 8
  const allCells = Array.from({ length: size * size }, (_, idx) => ({
    row: Math.floor(idx / size),
    col: idx % size,
  })).sort(() => rng() - 0.5)

  for (const cell of allCells) {
    if (clues.size >= targetClues) {
      break
    }
    placeClue(cell.row, cell.col, clues, rowCounts, colCounts)
  }

  for (const key of clues.keys()) {
    const [rowStr, colStr] = key.split('-')
    const row = Number(rowStr)
    const col = Number(colStr)
    clues.set(key, mixColors(solvedRows[row], solvedCols[col]))
  }

  return {
    size,
    clues,
    solvedRows,
    solvedCols,
  }
}


export function ColorFusionTab({ dateKey, showGame }: ColorFusionTabProps) {
  // Estado para toggle de cuadrícula
  const [showObjective, setShowObjective] = useState(false)
  const puzzle = useMemo(() => buildDailyPuzzle(dateKey), [dateKey])
  const [rowColors, setRowColors] = useState<Array<string | null>>(Array.from({ length: puzzle.size }, () => null))
  const [colColors, setColColors] = useState<Array<string | null>>(Array.from({ length: puzzle.size }, () => null))
  // Animación de relleno
  const [animating, setAnimating] = useState<{ type: 'row' | 'col'; index: number; color: string } | null>(null)
  const [animationStep, setAnimationStep] = useState(0)
  const pendingColorRef = useRef<{ type: 'row' | 'col'; index: number; color: string } | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null)
  // No validaciones, todo es reactivo
  const [isComplete, setIsComplete] = useState(false)
  const [recentlyCorrectKeys, setRecentlyCorrectKeys] = useState<string[]>([])
  const confettiRef = useRef<HTMLDivElement>(null)
  const miniObjectiveRef = useRef<HTMLDivElement>(null)
  const boardFrameRef = useRef<HTMLDivElement>(null)
  const [overlayRects, setOverlayRects] = useState<{ mini: DOMRect; board: DOMRect } | null>(null)
  const soundPlayersRef = useRef<Partial<Record<SoundName, HTMLAudioElement>>>({})
  const previousCorrectRef = useRef<Set<string>>(new Set())
  const previousCompleteRef = useRef(false)

  const playSound = useCallback((name: SoundName, volume = 0.14) => {
    const player = soundPlayersRef.current[name]
    if (!player) {
      return
    }
    const instance = new Audio(player.src)
    instance.volume = volume
    instance.play().catch(() => {})
  }, [])

  const applyColor = useCallback((color: string) => {
    if (!selectedTarget) return
    playSound('paint', 0.12)
    setAnimating({ type: selectedTarget.type, index: selectedTarget.index, color })
    setAnimationStep(0)
    pendingColorRef.current = { type: selectedTarget.type, index: selectedTarget.index, color }
  }, [selectedTarget, playSound])

  useEffect(() => {
    const players: Partial<Record<SoundName, HTMLAudioElement>> = {}
    ;(Object.keys(SOUND_SOURCES) as SoundName[]).forEach((name) => {
      const audio = new Audio(SOUND_SOURCES[name])
      audio.preload = 'auto'
      players[name] = audio
    })
    soundPlayersRef.current = players
  }, [])

  // Animación smooth de relleno
  useEffect(() => {
    if (!animating) return
    const size = puzzle.size
    if (animationStep >= size) {
      // Al terminar, aplica el color a toda la fila/columna fuera del render
      setTimeout(() => {
        const pending = pendingColorRef.current
        if (!pending) return
        if (pending.type === 'row') {
          setRowColors((prev) => prev.map((c, i) => i === pending.index ? pending.color : c))
        } else {
          setColColors((prev) => prev.map((c, i) => i === pending.index ? pending.color : c))
        }
        setAnimating(null)
        setAnimationStep(0)
        pendingColorRef.current = null
      }, 0)
      return
    }
    const timeout = setTimeout(() => {
      setAnimationStep((step) => step + 1)
    }, 45)
    return () => clearTimeout(timeout)
  }, [animating, animationStep, puzzle.size])

  const openPalette = (target: Target) => {
    playSound('select', 0.1)
    setSelectedTarget(target)
    playSound('tap', 0.08)
  }

  // No runValidation, todo es reactivo

  const getObjectiveCellColor = (row: number, col: number): string => {
    const key = cellKey(row, col)
    const clueColor = puzzle.clues.get(key)
    if (clueColor) {
      return clueColor
    }

    return '#FFFFFF'
  }

  const getPlayCellColor = useCallback((row: number, col: number): string => {
    // Si está animando, mostrar el color progresivamente
    if (animating) {
      if (animating.type === 'row' && row === animating.index && col < animationStep) {
        // Animando fila
        const colColor = colColors[col]
        if (!colColor) return animating.color // Mostrar color puro si la otra dimensión es null
        return mixColors(animating.color, colColor)
      }
      if (animating.type === 'col' && col === animating.index && row < animationStep) {
        // Animando columna
        const rowColor = rowColors[row]
        if (!rowColor) return animating.color // Mostrar color puro si la otra dimensión es null
        return mixColors(rowColor, animating.color)
      }
    }
    // Normal
    const rowColor = rowColors[row]
    const colColor = colColors[col]
    if (rowColor && colColor) {
      return mixColors(rowColor, colColor)
    }
    if (rowColor) return rowColor
    if (colColor) return colColor
    return '#E5E7EB'
  }, [animating, animationStep, rowColors, colColors])

  // Chequeo de completado
  useEffect(() => {
    let allOk = true
    const nowCorrectKeys = new Set<string>()
    for (let row = 0; row < puzzle.size; row++) {
      for (let col = 0; col < puzzle.size; col++) {
        const key = `${row}-${col}`
        if (puzzle.clues.has(key)) {
          // Solo comparar donde hay pista
          const expected = puzzle.clues.get(key)
          const actual = getPlayCellColor(row, col)
          if (expected?.toLowerCase() !== actual?.toLowerCase()) {
            allOk = false
          } else {
            nowCorrectKeys.add(key)
          }
        }
      }
    }

    const newlyCorrect = [...nowCorrectKeys].filter((key) => !previousCorrectRef.current.has(key))
    if (newlyCorrect.length > 0) {
      setRecentlyCorrectKeys(newlyCorrect)
      playSound('correct', 0.13)
      setTimeout(() => setRecentlyCorrectKeys([]), 420)
    }
    previousCorrectRef.current = nowCorrectKeys

    if (allOk && !previousCompleteRef.current) {
      playSound('complete', 0.16)
    }
    previousCompleteRef.current = allOk

    // Usar setTimeout para evitar cascada de renders
    setTimeout(() => setIsComplete(allOk), 0)
  }, [rowColors, colColors, puzzle, getPlayCellColor, playSound])

  useLayoutEffect(() => {
    const updateRects = () => {
      const mini = miniObjectiveRef.current?.getBoundingClientRect()
      const board = boardFrameRef.current?.getBoundingClientRect()
      if (!mini || !board) {
        return
      }
      setOverlayRects({ mini, board })
    }

    updateRects()
    window.addEventListener('resize', updateRects)
    window.addEventListener('scroll', updateRects, true)
    return () => {
      window.removeEventListener('resize', updateRects)
      window.removeEventListener('scroll', updateRects, true)
    }
  }, [showObjective, puzzle.size])

  return (
    <section className="relative overflow-visible rounded-[2rem] border border-[#f6f6f5] bg-gradient-to-br from-[#f7f3ea] via-[#f2ecdf] to-[#ede5d7] p-4 shadow-[0_20px_40px_rgba(92,75,49,0.14)] sm:p-6">
      {/* Mensaje de completado con explosión de colores */}
      {isComplete && (
        <div ref={confettiRef} className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none select-none">
          <div className="relative">
            <span className="block text-3xl sm:text-5xl font-extrabold text-white drop-shadow-lg px-8 py-6 rounded-3xl animate-pop bg-gradient-to-br from-pink-400 via-yellow-300 to-green-400 border-4 border-white shadow-2xl">
              ¡Completado!
            </span>
            <div className="absolute inset-0 overflow-visible">
              <ConfettiExplosion />
            </div>
          </div>
        </div>
      )}
      {!showGame ? (
        <div className="mx-auto flex max-w-[920px] flex-col items-center gap-5 rounded-[1.8rem] border border-[#ddceb5] bg-gradient-to-b from-[#f8f2e7] via-[#f3ecde] to-[#eee3d2] p-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_24px_35px_rgba(94,72,38,0.24)] sm:gap-6 sm:p-6 lg:p-7">
          <h2 className="text-xl font-black sm:text-3xl" aria-label="CruciGama">
            <span className="inline-flex items-center gap-[1px]">
              {CRUCIGAMA_LABEL.split('').map((char, index) => (
                <span
                  key={`crucigama-title-char-intro-${index}`}
                  style={{ color: CRUCIGAMA_GRADIENT[Math.min(index, CRUCIGAMA_GRADIENT.length - 1)] }}
                >
                  {char}
                </span>
              ))}
            </span>
          </h2>

          <p className="max-w-[60ch] text-sm font-semibold leading-6 text-[#5a4631] sm:text-base">
            Mezcla colores de filas y columnas hasta igualar todas las casillas de pista. Usa el botón superior
            junto a Salir para entrar al mapa de hoy.
          </p>

          <div className="w-full rounded-[1.6rem] border border-[#d7c6a8] bg-[#f8f3ea] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-[#4d3c2a]">Paleta</p>
                <p className="text-xs font-semibold text-[#735a3d]">Los colores que se usan en el juego.</p>
              </div>
              <div className="rounded-full border border-[#d7c6a8] bg-white px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#8a673f]">
                12 tonos
              </div>
            </div>

            <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
              {INTRO_PALETTE_PREVIEW.map((hex) => (
                <div
                  key={`preview-palette-${hex}`}
                  className="palette-swatch h-10 rounded-2xl border border-[#8d6b46] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.1),0_8px_12px_rgba(72,54,29,0.18)] sm:h-12"
                  style={{ backgroundColor: hex }}
                  title={hex.toUpperCase()}
                />
              ))}
            </div>
          </div>

          <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
            <div className="flex flex-col items-center rounded-[1.6rem] border border-[#d7c6a8] bg-[#f8f3ea] px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:px-4 sm:py-5 lg:px-5 lg:py-6">
              <div className="mb-4 flex w-full items-center justify-between gap-2 text-left">
                <div>
                  <p className="text-sm font-black text-[#4d3c2a]">Vista de ejemplo</p>
                  <p className="text-xs font-semibold text-[#735a3d]">Así se ve el mapa antes de jugar.</p>
                </div>
                <div className="rounded-full border border-[#d7c6a8] bg-white px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#8a673f]">
                  5 x 5
                </div>
              </div>

              <div className="example-board mx-auto flex w-full justify-center overflow-x-auto overflow-y-hidden py-1">
                <div className="grid grid-cols-[var(--example-label-size)_repeat(5,var(--example-cell-size))] gap-[var(--example-gap)]">
                  <div />
                  {INTRO_COLUMN_SELECTOR_COLORS.map((hex, index) => (
                    <div
                      key={`example-col-${hex}`}
                      className={`flex h-[var(--example-label-height)] items-center justify-center rounded-full border-2 border-[#c9b797] shadow-[inset_0_3px_0_rgba(255,255,255,0.78),inset_0_-3px_0_rgba(0,0,0,0.1),0_10px_14px_rgba(91,72,39,0.25)] ${index < 2 ? 'ring-2 ring-emerald-400' : ''}`}
                      style={{ backgroundColor: hex }}
                    >
                    </div>
                  ))}

                  {INTRO_ROW_SELECTOR_COLORS.map((rowColor, rowIndex) => (
                    <Fragment key={`example-row-${rowIndex}`}>
                      <div
                        className={`flex h-[var(--example-label-height)] items-center justify-center rounded-full border-2 border-[#c9b797] text-[9px] font-black shadow-[inset_0_3px_0_rgba(255,255,255,0.78),inset_0_-3px_0_rgba(0,0,0,0.1),0_10px_14px_rgba(91,72,39,0.25)] sm:text-xs ${rowIndex < 2 ? 'ring-2 ring-emerald-400' : ''}`}
                        style={{ backgroundColor: rowColor }}
                      >
                      </div>
                      {Array.from({ length: 5 }, (_, colIndex) => {
                        const columnColor = INTRO_COLUMN_SELECTOR_COLORS[colIndex]
                        const mixedColor = mixColors(rowColor, columnColor)
                        return (
                          <div
                            key={`example-cell-${rowIndex}-${colIndex}`}
                            className="example-cell relative rounded-[7px] border border-[#71573f] shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-3px_0_rgba(0,0,0,0.12),0_10px_14px_rgba(44,30,12,0.18)] sm:rounded-[9px]"
                            style={{ backgroundColor: mixedColor }}
                          >
                          </div>
                        )
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-[#d7c6a8] bg-[#f8f3ea] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:p-4 lg:p-5">
              <p className="text-sm font-black text-[#4d3c2a]">Cómo se juega</p>
              <ol className="mt-3 space-y-3 text-left text-xs font-semibold text-[#735a3d]">
                <li className="rounded-2xl border border-[#e0d2bd] bg-white/70 p-3">1. Usa el botón superior de CruciGama para entrar al mapa de hoy.</li>
                <li className="rounded-2xl border border-[#e0d2bd] bg-white/70 p-3">2. Elige una fila o columna y aplícale un color desde la paleta.</li>
                <li className="rounded-2xl border border-[#e0d2bd] bg-white/70 p-3">3. Cuando una casilla coincide con la pista, se marca en verde.</li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-black sm:text-2xl" aria-label="CruciGama">
                <span className="inline-flex items-center gap-[1px]">
                  {CRUCIGAMA_LABEL.split('').map((char, index) => (
                    <span
                      key={`crucigama-title-char-${index}`}
                      style={{ color: CRUCIGAMA_GRADIENT[Math.min(index, CRUCIGAMA_GRADIENT.length - 1)] }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
              </h2>
              <div ref={miniObjectiveRef} className="mt-2 h-[108px] w-[108px]" />
            </div>
            {/* Sin contador de validaciones */}
          </div>

          <div className="cruci-layout relative flex items-start justify-center">
            <div
              className="flex justify-center"
            >
              <div ref={boardFrameRef} className="mx-auto w-max rounded-[2rem] border border-[#d7c9b0] bg-gradient-to-br from-[#f6efdf] to-[#e9ddc8] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_24px_rgba(97,75,39,0.2)]">
                <div
                  className="grid"
                  style={{
                    gap: 'var(--grid-gap)',
                    gridTemplateColumns: `var(--selector-size) repeat(${puzzle.size}, var(--cell-size))`,
                    gridTemplateRows: `var(--selector-size) repeat(${puzzle.size}, var(--cell-size))`,
                  }}
                >
                  <div className="rounded bg-transparent" />
                  {Array.from({ length: puzzle.size }, (_, col) => {
                    const selected = selectedTarget?.type === 'col' && selectedTarget.index === col
                    const colColor = colColors[col]
                    return (
                      <button
                        key={`col-${col}`}
                        type="button"
                        onClick={() => openPalette({ type: 'col', index: col })}
                        className={`selector-chip relative flex items-center justify-center rounded-full border-2 border-[#c9b797] shadow-[inset_0_3px_0_rgba(255,255,255,0.8),inset_0_-3px_0_rgba(0,0,0,0.12),0_10px_14px_rgba(91,72,39,0.32)] transition ${selected ? 'ring-4 ring-emerald-400' : ''}`}
                        style={{
                          backgroundColor: colColor ?? '#efe6d6',
                        }}
                        title={`Columna ${col + 1}`}
                      />
                    )
                  })}
                  {Array.from({ length: puzzle.size }, (_, row) => (
                    <Fragment key={`row-line-${row}`}>
                      <button
                        key={`row-${row}`}
                        type="button"
                        onClick={() => openPalette({ type: 'row', index: row })}
                        className={`selector-chip relative flex items-center justify-center rounded-full border-2 border-[#c9b797] shadow-[inset_0_3px_0_rgba(255,255,255,0.8),inset_0_-3px_0_rgba(0,0,0,0.12),0_10px_14px_rgba(91,72,39,0.32)] transition ${(selectedTarget?.type === 'row' && selectedTarget.index === row) ? 'ring-4 ring-emerald-400' : ''}`}
                        style={{
                          backgroundColor: rowColors[row] ?? '#efe6d6',
                        }}
                        title={`Fila ${row + 1}`}
                      />
                      {Array.from({ length: puzzle.size }, (_, col) => {
                        return (
                          <div
                            key={`play-cell-${row}-${col}`}
                            className={`mix-cell border border-[#71573f] shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-3px_0_rgba(0,0,0,0.14),0_10px_14px_rgba(44,30,12,0.3)] ${recentlyCorrectKeys.includes(cellKey(row, col)) ? 'play-correct-pop' : ''}`}
                            style={{
                              backgroundColor: getPlayCellColor(row, col),
                            }}
                            title="Casilla de mezcla"
                          />
                        )
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {showGame && overlayRects && (
        <button
          type="button"
          onClick={() => {
            playSound('flip', 0.1)
            setShowObjective((previous) => !previous)
          }}
          className="fixed z-[110] rounded-[2rem] border border-[#d7c9b0] bg-gradient-to-br from-[#f6efdf] to-[#e9ddc8] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_24px_rgba(97,75,39,0.2)] transition-[transform,opacity] duration-500 ease-[cubic-bezier(.77,0,.18,1)]"
          style={{
            left: overlayRects.mini.left,
            top: overlayRects.mini.top,
            width: overlayRects.mini.width,
            height: overlayRects.mini.height,
            transformOrigin: 'top left',
            transform: showObjective
              ? `translate(${overlayRects.board.left - overlayRects.mini.left}px, ${overlayRects.board.top - overlayRects.mini.top}px) scale(${overlayRects.board.width / overlayRects.mini.width}, ${overlayRects.board.height / overlayRects.mini.height})`
              : 'translate(0px, 0px) scale(1)',
            opacity: showObjective ? 1 : 0.95,
          }}
          aria-label={showObjective ? 'Ocultar tabla objetivo' : 'Mostrar tabla objetivo'}
        >
          <div
            className="grid"
            style={{
              gap: '1px',
              gridTemplateColumns: `repeat(${puzzle.size}, 14px)`,
              gridTemplateRows: `repeat(${puzzle.size}, 14px)`,
            }}
          >
            {Array.from({ length: puzzle.size }, (_, row) =>
              Array.from({ length: puzzle.size }, (_, col) => {
                const key = cellKey(row, col)
                const isClue = puzzle.clues.has(key)
                let isCorrect = false
                if (isClue) {
                  const expected = puzzle.clues.get(key)
                  const actual = getPlayCellColor(row, col)
                  if (expected?.toLowerCase() === actual?.toLowerCase()) {
                    isCorrect = true
                  }
                }
                return (
                  <div
                    key={`goal-cell-overlay-${row}-${col}`}
                    className={`rounded-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.38),inset_0_-1px_0_rgba(0,0,0,0.14),0_1px_3px_rgba(44,30,12,0.28)] ${isCorrect ? 'ring-2 ring-emerald-500' : ''} ${recentlyCorrectKeys.includes(key) ? 'objective-correct-pop' : ''}`}
                    style={{
                      backgroundColor: getObjectiveCellColor(row, col),
                    }}
                    title={isClue ? 'Pista fija' : 'Sin pista'}
                  />
                )
              }),
            )}
          </div>
        </button>
      )}
      <style>{`
        .cruci-layout {
          --cell-size: 80px;
          --selector-size: 56px;
          --grid-gap: 12px;
          min-height: calc(var(--selector-size) + (5 * var(--cell-size)) + (5 * var(--grid-gap)) + 44px);
        }
        .selector-chip {
          width: var(--selector-size);
          height: var(--selector-size);
        }
        .mix-cell {
          border-radius: calc(var(--cell-size) * 0.08);
        }
        .example-cell {
          aspect-ratio: 1 / 1;
          width: var(--example-cell-size);
        }
        .play-correct-pop {
          animation: play-correct-pop 420ms cubic-bezier(.61,1.6,.7,1);
        }
        .objective-correct-pop {
          animation: objective-correct-pop 420ms cubic-bezier(.61,1.6,.7,1);
        }
        @keyframes play-correct-pop {
          0% { transform: scale(0.92); }
          72% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        @keyframes objective-correct-pop {
          0% { transform: scale(0.88); }
          72% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        
        @media (max-width: 1024px) {
          .cruci-layout {
            --cell-size: 66px;
            --selector-size: 46px;
            --grid-gap: 10px;
          }
        }
        @media (max-width: 768px) {
          .cruci-layout {
            --cell-size: 52px;
            --selector-size: 38px;
            --grid-gap: 8px;
          }
          .palette-swatch {
            width: 44px;
            height: 44px;
            border-radius: 12px;
          }
        }
        @media (max-width: 480px) {
          .cruci-layout {
            --cell-size: 45px;
            --selector-size: 32px;
            --grid-gap: 6px;
          }
          .example-board {
            --example-label-size: 12px;
            --example-cell-size: 16px;
            --example-gap: 2px;
            --example-label-height: 18px;
          }
          .palette-swatch {
            width: 38px;
            height: 38px;
            border-radius: 10px;
          }
        }
        @media (min-width: 481px) {
          .example-board {
            --example-label-size: 22px;
            --example-cell-size: 28px;
            --example-gap: 4px;
            --example-label-height: 24px;
          }
        }
        @media (min-width: 769px) {
          .example-board {
            --example-label-size: 36px;
            --example-cell-size: 44px;
            --example-gap: 8px;
            --example-label-height: 40px;
          }
        }
      `}</style>

      {showGame && (
        <div
        className="relative z-[100] mx-auto mt-6 w-full max-w-[640px] rounded-[1.75rem] border border-[#d8cab1] bg-gradient-to-br from-[#f5efdf] to-[#eadfc9] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_20px_30px_rgba(86,69,37,0.28)] md:absolute md:right-0 md:top-8 md:mt-0 md:w-max md:max-w-none md:p-4"
        aria-hidden={false}
      >
        <div className="grid grid-cols-6 gap-2.5 md:hidden">
          {PALETTE_OPTIONS.map((option) => (
            <button
              key={`mobile-${option.group}-${option.hex}`}
              type="button"
              onClick={() => {
                if (!selectedTarget) {
                  return
                }
                applyColor(option.hex)
              }}
              className="palette-swatch h-14 w-14 rounded-2xl border border-[#8d6b46] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.1),0_8px_12px_rgba(72,54,29,0.35)] transition hover:-translate-y-0.5 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: option.hex }}
              title={option.hex.toUpperCase()}
              disabled={!selectedTarget}
            />
          ))}
        </div>

        <div className="hidden space-y-2.5 md:block">
          {['Neutros', 'Rojos', 'Naranjas', 'Verdes', 'Azules', 'Morados'].map((group) => (
            <div key={`palette-row-${group}`} className="flex flex-wrap gap-2.5">
              {PALETTE_OPTIONS
                .filter((option) => option.group === group)
                .map((option) => (
                  <button
                    key={`${group}-${option.hex}`}
                    type="button"
                    onClick={() => {
                      if (!selectedTarget) {
                        return
                      }
                      applyColor(option.hex)
                    }}
                    className="palette-swatch h-14 w-14 rounded-2xl border border-[#8d6b46] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.1),0_8px_12px_rgba(72,54,29,0.35)] transition hover:-translate-y-0.5 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: option.hex }}
                    title={option.hex.toUpperCase()}
                    disabled={!selectedTarget}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Sin botón de validar, cuadrícula reactiva */}
    </section>
  )
}

// ConfettiExplosion: simple CSS confetti burst
// ...existing code...

function ConfettiExplosion() {
  // Generar datos estables
  const confettiData = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => {
      // Usar un seed simple para que sea estable
      const seed = i * 12345 + 6789
      const rand = (x: number) => {
        let t = x
        t ^= t << 13
        t ^= t >> 17
        t ^= t << 5
        return Math.abs(t) / 0xffffffff
      }
      const angle = rand(seed) * 360
      const dist = 80 + rand(seed + 1) * 60
      const x = Math.cos(angle) * dist
      const y = Math.sin(angle) * dist
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
      const delay = rand(seed + 2) * 0.2
      return { i, x, y, angle, color, delay }
    })
  }, [])
  return <>
    {confettiData.map(({ i, x, y, angle, color, delay }) => (
      <span
        key={i}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 14,
          height: 14,
          background: color,
          borderRadius: 3,
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${angle}deg)`,
          opacity: 0.85,
          animation: `confetti-pop 0.7s cubic-bezier(.61,1.6,.7,1) ${delay}s both`,
          zIndex: 100,
        }}
      />
    ))}
    <style>{`
      @keyframes confetti-pop {
        0% { opacity: 0; transform: translate(-50%,-50%) scale(0.5); }
        60% { opacity: 1; }
        100% { opacity: 0; transform: translate(-50%,-50%) scale(1.2); }
      }
      .animate-pop {
        animation: pop-scale 0.7s cubic-bezier(.61,1.6,.7,1);
      }
      @keyframes pop-scale {
        0% { transform: scale(0.7); }
        80% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
    `}</style>
  </>
}
