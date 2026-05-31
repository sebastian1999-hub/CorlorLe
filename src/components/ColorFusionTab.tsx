
import { Fragment, useMemo, useState, useEffect, useRef, useCallback } from 'react'
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
  { hex: '#E0E0E0', group: 'Neutros' },

  { hex: '#C00000', group: 'Rojos' },
  { hex: '#EF9A9A', group: 'Rojos' },

  { hex: '#E65100', group: 'Naranjas' },
  { hex: '#FFCC80', group: 'Naranjas' },

  { hex: '#2E7D32', group: 'Verdes' },
  { hex: '#A5D6A7', group: 'Verdes' },

  { hex: '#0D47A1', group: 'Azules' },
  { hex: '#90CAF9', group: 'Azules' },
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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  // No validaciones, todo es reactivo
  const [isComplete, setIsComplete] = useState(false)
  const confettiRef = useRef<HTMLDivElement>(null)

  const applyColor = useCallback((color: string) => {
    if (!selectedTarget) return
    setAnimating({ type: selectedTarget.type, index: selectedTarget.index, color })
    setAnimationStep(0)
    pendingColorRef.current = { type: selectedTarget.type, index: selectedTarget.index, color }
  }, [selectedTarget])

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
    // Usar setTimeout para evitar cascada de renders
    setTimeout(() => setIsComplete(allOk), 0)
  }, [rowColors, colColors, puzzle, getPlayCellColor])

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


      <div className="flex justify-center mb-4">
        <button
          type="button"
          className="px-4 py-2 rounded-full bg-emerald-100 text-emerald-800 font-bold shadow transition hover:bg-emerald-200"
          onClick={() => setShowObjective((v) => !v)}
        >
          {showObjective ? 'Ver mi tablero' : 'Ver tabla objetivo'}
        </button>
      </div>

      <div className="relative flex justify-center items-center min-h-[340px]">
        <div
          className={`absolute left-0 right-0 top-0 bottom-0 flip-card transition-transform duration-700 ease-in-out ${showObjective ? 'flip-card-hide' : 'flip-card-show'} flex justify-center`}
        >
          <div className="mx-auto w-max p-0 bg-transparent">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `40px repeat(${puzzle.size}, 48px)`,
                gridTemplateRows: `40px repeat(${puzzle.size}, 48px)`,
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
                    className={`relative flex items-center justify-center rounded-full border-2 border-zinc-400 shadow transition h-10 w-10 sm:h-8 sm:w-8 ${selected ? 'ring-4 ring-emerald-400' : ''}`}
                    style={{
                      backgroundColor: colColor ?? 'transparent',
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
                    className={`relative flex items-center justify-center rounded-full border-2 border-zinc-400 shadow transition h-10 w-10 sm:h-8 sm:w-8 ${(selectedTarget?.type === 'row' && selectedTarget.index === row) ? 'ring-4 ring-emerald-400' : ''}`}
                    style={{
                      backgroundColor: rowColors[row] ?? 'transparent',
                    }}
                    title={`Fila ${row + 1}`}
                  >
                    {!rowColors[row] && <span className="text-xs font-black text-amber-700">F</span>}
                  </button>
                  {Array.from({ length: puzzle.size }, (_, col) => {
                    const key = cellKey(row, col)
                    return (
                      <div
                        key={`play-cell-${row}-${col}`}
                        className="rounded border border-black"
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
        <div
          className={`absolute left-0 right-0 top-0 bottom-0 flip-card transition-transform duration-700 ease-in-out ${showObjective ? 'flip-card-show' : 'flip-card-hide'} flex justify-center`}
        >
          <div className="mx-auto w-max p-0 bg-transparent">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `40px repeat(${puzzle.size}, 48px)`,
                gridTemplateRows: `40px repeat(${puzzle.size}, 48px)`,
              }}
            >
              {/* Selectores invisibles de columna */}
              <div className="rounded bg-transparent" />
              {Array.from({ length: puzzle.size }, (_, col) => (
                <div
                  key={`col-invisible-${col}`}
                  className="h-10 w-10 sm:h-8 sm:w-8 rounded-full opacity-0"
                />
              ))}
              {Array.from({ length: puzzle.size }, (_, row) => (
                <Fragment key={`row-line-obj-${row}`}>
                  {/* Selector invisible de fila */}
                  <div
                    key={`row-invisible-${row}`}
                    className="h-10 w-10 sm:h-8 sm:w-8 rounded-full opacity-0"
                  />
                  {Array.from({ length: puzzle.size }, (_, col) => {
                    const key = cellKey(row, col)
                    const isClue = puzzle.clues.has(key)
                    // ¿Está acertado?
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
                        key={`goal-cell-${row}-${col}`}
                        className={`rounded border ${isCorrect ? 'border-4 border-emerald-500' : 'border-black'}`}
                        style={{
                          backgroundColor: getObjectiveCellColor(row, col),
                        }}
                        title={isClue ? 'Pista fija' : 'Sin pista'}
                      />
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .flip-card {
          perspective: 1400px;
          transform-style: preserve-3d;
        }
        .flip-card-show {
          transform: rotateY(0deg);
          opacity: 1;
          z-index: 2;
          box-shadow: 0 8px 32px 0 rgba(60,60,60,0.10);
          backface-visibility: hidden;
          transition: transform 0.7s cubic-bezier(.77,0,.18,1), opacity 0.5s;
        }
        .flip-card-hide {
          transform: rotateY(-100deg);
          opacity: 0;
          z-index: 1;
          pointer-events: none;
          box-shadow: none;
          backface-visibility: hidden;
          transition: transform 0.7s cubic-bezier(.77,0,.18,1), opacity 0.5s;
        }
      `}</style>

      {isPaletteOpen && (
        <div
          className="fixed z-40 right-6 top-1/2 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl transition-transform duration-300 ease-out w-max"
          aria-hidden={false}
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
            {['Neutros', 'Rojos', 'Naranjas', 'Verdes', 'Azules'].map((group) => (
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
      )}

      {/* Sin botón de validar, cuadrícula reactiva */}
    </section>
  )
}

// ConfettiExplosion: simple CSS confetti burst
// ...existing code...

function ConfettiExplosion() {
  // 18 confetti pieces, random color/angle, pero estables
  const colors = [
    '#F97316', '#FB923C', '#FACC15', '#84CC16', '#22C55E', '#06B6D4', '#3B82F6', '#6366F1', '#A855F7',
    '#F472B6', '#F87171', '#34D399', '#FBBF24', '#60A5FA', '#A3E635', '#F43F5E', '#F59E42', '#10B981'
  ]
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
      const color = colors[i % colors.length]
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
