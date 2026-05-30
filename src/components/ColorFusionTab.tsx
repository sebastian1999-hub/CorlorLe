import { Fragment, useMemo, useState, useEffect, useRef } from 'react'
import { hexToRgb, rgbToHex } from '../lib/colorMath'

type ColorFusionTabProps = {
  dateKey: string
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
  { hex: '#616161', group: 'Neutros' },
  { hex: '#9E9E9E', group: 'Neutros' },
  { hex: '#E0E0E0', group: 'Neutros' },

  { hex: '#C00000', group: 'Rojos' },
  { hex: '#E53935', group: 'Rojos' },
  { hex: '#EF9A9A', group: 'Rojos' },

  { hex: '#E65100', group: 'Naranjas' },
  { hex: '#FB8C00', group: 'Naranjas' },
  { hex: '#FFCC80', group: 'Naranjas' },

  { hex: '#F9A825', group: 'Amarillos' },
  { hex: '#FDD835', group: 'Amarillos' },
  { hex: '#FFF59D', group: 'Amarillos' },

  { hex: '#2E7D32', group: 'Verdes' },
  { hex: '#43A047', group: 'Verdes' },
  { hex: '#A5D6A7', group: 'Verdes' },

  { hex: '#0D47A1', group: 'Azules' },
  { hex: '#1E88E5', group: 'Azules' },
  { hex: '#90CAF9', group: 'Azules' },

  { hex: '#4A148C', group: 'Morados' },
  { hex: '#7B1FA2', group: 'Morados' },
  { hex: '#CE93D8', group: 'Morados' },
]

const PALETTE_HEX = PALETTE_OPTIONS.map((entry) => entry.hex)

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


export function ColorFusionTab({ dateKey }: ColorFusionTabProps) {
  const puzzle = useMemo(() => buildDailyPuzzle(dateKey), [dateKey])
  const [rowColors, setRowColors] = useState<Array<string | null>>(Array.from({ length: puzzle.size }, () => null))
  const [colColors, setColColors] = useState<Array<string | null>>(Array.from({ length: puzzle.size }, () => null))
  // Animación de relleno
  const [animating, setAnimating] = useState<{ type: 'row' | 'col'; index: number; color: string } | null>(null)
  const [animationStep, setAnimationStep] = useState(0)
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  // No validaciones, todo es reactivo
  const [isComplete, setIsComplete] = useState(false)
  const confettiRef = useRef<HTMLDivElement>(null)

  const applyColor = (color: string) => {
    if (!selectedTarget) return
    setAnimating({ type: selectedTarget.type, index: selectedTarget.index, color })
    setAnimationStep(0)
  }

  // Animación smooth de relleno
  useEffect(() => {
    if (!animating) return
    const size = puzzle.size
    if (animationStep >= size) {
      // Al terminar, aplica el color a toda la fila/columna
      if (animating.type === 'row') {
        setRowColors((prev) => {
          const next = [...prev]
          next[animating.index] = animating.color
          return next
        })
      } else {
        setColColors((prev) => {
          const next = [...prev]
          next[animating.index] = animating.color
          return next
        })
      }
      setAnimating(null)
      setAnimationStep(0)
      return
    }
    const timeout = setTimeout(() => {
      setAnimationStep((step) => step + 1)
    }, 45)
    return () => clearTimeout(timeout)
  }, [animating, animationStep, puzzle.size])

  const openPalette = (target: Target) => {
    setSelectedTarget(target)
    setIsPaletteOpen(true)
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

  const getPlayCellColor = (row: number, col: number): string => {
    // Si está animando, mostrar el color progresivamente
    if (animating) {
      if (animating.type === 'row' && row === animating.index && col < animationStep) {
        // Animando fila
        const colColor = colColors[col]
        if (!colColor) return '#E5E7EB'
        return mixColors(animating.color, colColor)
      }
      if (animating.type === 'col' && col === animating.index && row < animationStep) {
        // Animando columna
        const rowColor = rowColors[row]
        if (!rowColor) return '#E5E7EB'
        return mixColors(rowColor, animating.color)
      }
    }
    // Normal
    const rowColor = rowColors[row]
    const colColor = colColors[col]
    if (!rowColor || !colColor) {
      return '#E5E7EB'
    }
    return mixColors(rowColor, colColor)
  }

  // Chequeo de completado
  useEffect(() => {
    let allOk = true
    for (let row = 0; row < puzzle.size; row++) {
      for (let col = 0; col < puzzle.size; col++) {
        const key = `${row}-${col}`
        if (puzzle.clues.has(key)) {
          // Solo comparar donde hay pista
          const expected = puzzle.clues.get(key)
          const actual = getPlayCellColor(row, col)
          if (expected?.toLowerCase() !== actual?.toLowerCase()) {
            allOk = false
            break
          }
        }
      }
      if (!allOk) break
    }
    setIsComplete(allOk)
  }, [rowColors, colColors, puzzle])

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/90 p-4 shadow-lg backdrop-blur sm:p-6 relative overflow-visible">
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
        </div>
        {/* Sin contador de validaciones */}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <div className="mx-auto w-max rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">Tabla Objetivo</p>
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${puzzle.size}, 34px)`,
                gridTemplateRows: `repeat(${puzzle.size}, 34px)`,
              }}
            >
              {Array.from({ length: puzzle.size }, (_, row) =>
                Array.from({ length: puzzle.size }, (_, col) => {
                  const key = cellKey(row, col)
                  const isClue = puzzle.clues.has(key)
                  const border = isClue ? '2px solid #f59e0b' : '1px solid #d4d4d8'

                  return (
                    <div
                      key={`goal-cell-${row}-${col}`}
                      className="rounded"
                      style={{
                        backgroundColor: getObjectiveCellColor(row, col),
                        border,
                      }}
                      title={isClue ? 'Pista fija' : 'Sin pista'}
                    />
                  )
                }),
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="mx-auto w-max rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `32px repeat(${puzzle.size}, 34px)`,
              gridTemplateRows: `32px repeat(${puzzle.size}, 34px)`,
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
                  className={`relative flex items-center justify-center rounded border-2 ${selected ? 'border-amber-600 shadow-[0_0_0_2px_rgba(245,158,11,0.25)]' : 'border-amber-400'} transition`}
                  style={{
                    backgroundColor: colColor ?? '#FFF7ED',
                    backgroundImage: colColor
                      ? undefined
                      : 'repeating-linear-gradient(135deg, rgba(245,158,11,0.22) 0 6px, transparent 6px 12px)',
                  }}
                  title={`Columna ${col + 1}`}
                >
                  {!colColor && <span className="text-xs font-black text-amber-700">C</span>}
                </button>
              )
            })}

            {Array.from({ length: puzzle.size }, (_, row) => (
              <Fragment key={`row-line-${row}`}>
                <button
                  key={`row-${row}`}
                  type="button"
                  onClick={() => openPalette({ type: 'row', index: row })}
                  className={`relative flex items-center justify-center rounded border-2 ${(selectedTarget?.type === 'row' && selectedTarget.index === row) ? 'border-amber-600 shadow-[0_0_0_2px_rgba(245,158,11,0.25)]' : 'border-amber-400'} transition`}
                  style={{
                    backgroundColor: rowColors[row] ?? '#FFF7ED',
                    backgroundImage: rowColors[row]
                      ? undefined
                      : 'repeating-linear-gradient(135deg, rgba(245,158,11,0.22) 0 6px, transparent 6px 12px)',
                  }}
                  title={`Fila ${row + 1}`}
                >
                  {!rowColors[row] && <span className="text-xs font-black text-amber-700">F</span>}
                </button>

                {Array.from({ length: puzzle.size }, (_, col) => {
                  const key = cellKey(row, col)
                  const border = puzzle.clues.has(key) ? '1px solid #d4d4d8' : '1px solid #d4d4d8'

                  return (
                    <div
                      key={`play-cell-${row}-${col}`}
                      className="rounded"
                      style={{
                        backgroundColor: getPlayCellColor(row, col),
                        border,
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

      {isPaletteOpen && (
        <div
          className="mt-4 transition-all duration-300 ease-out max-h-[520px] opacity-100"
          aria-hidden={false}
        >
          <div
            className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl transition-transform duration-300 ease-out sm:inset-x-6 md:static md:inset-auto md:bottom-auto md:shadow-sm translate-y-0 scale-100"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {selectedTarget ? (selectedTarget.type === 'row' ? `Fila ${selectedTarget.index + 1}` : `Columna ${selectedTarget.index + 1}`) : ''}
              </span>
              <button
                type="button"
                onClick={() => setIsPaletteOpen(false)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100"
                aria-label="Cerrar paleta"
              >
                ×
              </button>
            </div>

            <div className="space-y-2">
              {['Neutros', 'Rojos', 'Naranjas', 'Amarillos', 'Verdes', 'Azules', 'Morados'].map((group) => (
                <div key={`palette-row-${group}`} className="flex flex-wrap gap-2">
                  {PALETTE_OPTIONS
                    .filter((option) => option.group === group)
                    .map((option) => (
                      <button
                        key={`${group}-${option.hex}`}
                        type="button"
                        onClick={() => {
                          applyColor(option.hex)
                          setIsPaletteOpen(false)
                        }}
                        className="h-9 w-9 rounded border border-zinc-300 transition hover:scale-105 sm:h-8 sm:w-8"
                        style={{ backgroundColor: option.hex }}
                        title={option.hex.toUpperCase()}
                      />
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sin botón de validar, cuadrícula reactiva */}
    </section>
  )
}

// ConfettiExplosion: simple CSS confetti burst
function ConfettiExplosion() {
  // 18 confetti pieces, random color/angle
  const colors = [
    '#F97316', '#FB923C', '#FACC15', '#84CC16', '#22C55E', '#06B6D4', '#3B82F6', '#6366F1', '#A855F7',
    '#F472B6', '#F87171', '#34D399', '#FBBF24', '#60A5FA', '#A3E635', '#F43F5E', '#F59E42', '#10B981'
  ]
  const confetti = Array.from({ length: 18 }, (_, i) => {
    const angle = Math.random() * 360
    const dist = 80 + Math.random() * 60
    const x = Math.cos(angle) * dist
    const y = Math.sin(angle) * dist
    const color = colors[i % colors.length]
    const delay = Math.random() * 0.2
    return (
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
    )
  })
  return <>{confetti}
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
