import type { LeaderboardEntry } from '../types'

type LeaderboardProps = {
  entries: LeaderboardEntry[]
  title?: string
}

export function Leaderboard({ entries, title = 'Clasificacion general' }: LeaderboardProps) {
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
            className="grid grid-cols-[32px_1fr_auto] items-center gap-2 rounded-xl bg-zinc-900 px-3 py-3 text-zinc-100 sm:grid-cols-[40px_1fr_110px] sm:gap-3"
          >
            <span className="text-center font-bold text-amber-300">#{index + 1}</span>
            <div>
              <p className="font-semibold">{entry.username}</p>
              <p className="text-xs text-zinc-400">{entry.gamesPlayed} partida{entry.gamesPlayed !== 1 ? 's' : ''}</p>
            </div>
            <p className="text-right font-extrabold text-emerald-300">{entry.totalScore.toFixed(0)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
