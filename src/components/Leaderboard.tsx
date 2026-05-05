import type { LeaderboardEntry } from '../types'

type LeaderboardProps = {
  entries: LeaderboardEntry[]
  title?: string
  showColors?: boolean
}

export function Leaderboard({ entries, title = 'Clasificacion general', showColors = true }: LeaderboardProps) {
  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-4 shadow-lg backdrop-blur sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-1">
        <h2 className="text-base font-bold text-zinc-900 sm:text-xl">{title}</h2>
        <p className="text-sm text-zinc-500 whitespace-nowrap">{entries.length} jugadores</p>
      </div>

      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
            Aun no hay partidas. Se el primero en jugar.
          </p>
        )}

        {entries.map((entry, index) => (
          <div
            key={entry.userId}
            className="grid grid-cols-[32px_1fr_auto_auto_auto] items-center gap-2 rounded-xl bg-zinc-900 px-3 py-3 text-zinc-100 sm:grid-cols-[40px_1fr_110px_44px_44px] sm:gap-3"
          >
            <span className="text-center font-bold text-amber-300">#{index + 1}</span>
            <div>
              <p className="font-semibold">{entry.username}</p>
              <p className="text-xs text-zinc-400">{entry.gamesPlayed} partida{entry.gamesPlayed !== 1 ? 's' : ''}</p>
            </div>
            <p className="text-right font-extrabold text-emerald-300">{entry.totalScore.toFixed(0)}</p>
            {showColors ? (
              entry.targetColor && (
                <div
                  className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                  style={{ backgroundColor: entry.targetColor }}
                  title={`Objetivo: ${entry.targetColor}`}
                />
              )
            ) : (
              <div
                className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                title="Objetivo oculto"
              >
                <span className="flex h-full w-full items-center justify-center text-lg font-black text-zinc-200">?</span>
              </div>
            )}
            {showColors ? (
              entry.userColor && (
                <div
                  className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                  style={{ backgroundColor: entry.userColor }}
                  title={`Conseguido: ${entry.userColor}`}
                />
              )
            ) : (
              <div
                className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                title="Color conseguido oculto"
              >
                <span className="flex h-full w-full items-center justify-center text-lg font-black text-zinc-200">?</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
