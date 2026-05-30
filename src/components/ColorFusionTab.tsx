import { Fragment, useMemo, useState } from 'react'
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

const MAX_VALIDATIONS = 2
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
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [validationUses, setValidationUses] = useState(0)
  // Map cellKey -> { rowColor, colColor } frozen at validation
  const [revealedCellColors, setRevealedCellColors] = useState<Record<string, { rowColor: string|null, colColor: string|null }>>({})

  const applyColor = (color: string) => {
    if (!selectedTarget) {
      return
    }

    if (selectedTarget.type === 'row') {
      setRowColors((previous) => {
        const next = [...previous]
        next[selectedTarget.index] = color
        return next
      })
      return
    }

    setColColors((previous) => {
      const next = [...previous]
      next[selectedTarget.index] = color
      return next
    })
  }

  const openPalette = (target: Target) => {
    setSelectedTarget(target)
    setIsPaletteOpen(true)
  }

  const runValidation = () => {
    if (validationUses >= MAX_VALIDATIONS) {
      return
    }

    const nextUse = validationUses + 1
    setValidationUses(nextUse)

    const rowDelayMs = 130
    const revealRows = Array.from({ length: puzzle.size }, (_, i) => i)

    revealRows.forEach((row, rowIndex) => {
      window.setTimeout(() => {
        setRevealedCellColors((previous) => {
          const next = { ...previous }
          for (let col = 0; col < puzzle.size; col += 1) {
            const key = cellKey(row, col)
            // Only freeze if not already revealed
            if (!(key in next)) {
              next[key] = {
                rowColor: rowColors[row],
                colColor: colColors[col],
              }
            }
          }
          return next
        })
      }, rowIndex * rowDelayMs)
    })
  }

  const getObjectiveCellColor = (row: number, col: number): string => {
    const key = cellKey(row, col)
    const clueColor = puzzle.clues.get(key)
    if (clueColor) {
      return clueColor
    }

    return '#FFFFFF'
  }

  const getPlayCellColor = (row: number, col: number): string => {
    const key = cellKey(row, col)
    const frozen = revealedCellColors[key]
    if (!frozen) {
      return '#FFFFFF'
    }
    const { rowColor, colColor } = frozen
    if (!rowColor || !colColor) {
      return '#E5E7EB'
    }
    return mixColors(rowColor, colColor)
  }

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/90 p-4 shadow-lg backdrop-blur sm:p-6">
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
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">{Math.max(0, MAX_VALIDATIONS - validationUses)}/{MAX_VALIDATIONS}</p>
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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runValidation}
          disabled={validationUses >= MAX_VALIDATIONS}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Validar ({Math.max(0, MAX_VALIDATIONS - validationUses)}/{MAX_VALIDATIONS})
        </button>
      </div>
    </section>
  )
}
