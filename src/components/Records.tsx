import { useState } from 'react'

type RecordEntry = {
  userId: string
  username: string
  value: number
  valueLabel: string
  targetColor?: string
  userColor?: string
}

type RecordsProps = {
  closestColor: RecordEntry[]
  farthestColor: RecordEntry[]
  highestScore: RecordEntry[]
  lowestScore: RecordEntry[]
  mostFirstPlaces: RecordEntry[]
  loading?: boolean
}

export function Records({ closestColor, farthestColor, highestScore, lowestScore, mostFirstPlaces, loading = false }: RecordsProps) {
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})

  const toggleTable = (tableKey: string) => {
    setExpandedTables((current) => ({
      ...current,
      [tableKey]: !current[tableKey],
    }))
  }

  const renderTable = (
    tableKey: string,
    title: string,
    entries: RecordEntry[],
    valueFormatter: (val: number) => string
  ) => {
    const isExpanded = expandedTables[tableKey] ?? false
    const visibleEntries = isExpanded ? entries : entries.slice(0, 3)
    const showToggle = entries.length > 3

    return (
      <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-4 shadow-lg backdrop-blur sm:p-6">
        <h2 className="mb-4 text-base font-bold text-zinc-900 sm:text-xl">{title}</h2>

        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
              Aun no hay registros. Se el primero en jugar.
            </p>
          )}

          {visibleEntries.map((entry, index) => (
            <div
              key={entry.userId}
              className="grid grid-cols-[32px_1fr_auto_auto_auto] items-center gap-2 rounded-xl bg-zinc-900 px-3 py-3 text-zinc-100 sm:grid-cols-[40px_1fr_110px_44px_44px] sm:gap-3"
            >
              <span className="text-center font-bold text-amber-300">#{index + 1}</span>
              <div>
                <p className="font-semibold">{entry.username}</p>
                <p className="text-xs text-zinc-400">{entry.valueLabel}</p>
              </div>
              <p className="text-right font-extrabold text-emerald-300">{valueFormatter(entry.value)}</p>
              {entry.targetColor && (
                <div
                  className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                  style={{ backgroundColor: entry.targetColor }}
                  title={`Objetivo: ${entry.targetColor}`}
                />
              )}
              {entry.userColor && (
                <div
                  className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                  style={{ backgroundColor: entry.userColor }}
                  title={`Conseguido: ${entry.userColor}`}
                />
              )}
            </div>
          ))}
        </div>

        {showToggle && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => toggleTable(tableKey)}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              {isExpanded ? 'Ver menos' : 'Ver más'}
            </button>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-6">
      {loading && (
        <div className="rounded-3xl border border-zinc-900/10 bg-white/80 p-6 text-center">
          <p className="text-zinc-600">Cargando registros...</p>
        </div>
      )}

      {!loading && (
        <>
          {renderTable('closestColor', 'Colorimetro humano', closestColor, (val) => `${val.toFixed(2)}%`)}
          {renderTable('farthestColor', 'Mas daltonico', farthestColor, (val) => `${val.toFixed(2)}%`)}
          {renderTable('highestScore', 'Mayor Puntuación', highestScore, (val) => `${val.toFixed(0)} pts`)}
          {renderTable('lowestScore', 'Peor Puntuación', lowestScore, (val) => `${val.toFixed(0)} pts`)}
          {renderTable(
            'mostFirstPlaces',
            'Más Primeros Lugares',
            mostFirstPlaces,
            (val) => `${val.toFixed(0)} veces`
          )}
        </>
      )}
    </div>
  )
}
