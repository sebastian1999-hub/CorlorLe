import type { LeaderboardEntry } from '../types'

type LeaderboardProps = {
  entries: LeaderboardEntry[]
}

export function Leaderboard({ entries }: LeaderboardProps) {
  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-6 shadow-lg backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-900">Clasificacion general</h2>
        <p className="text-sm text-zinc-500">{entries.length} jugadores</p>
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
            className="grid grid-cols-[40px_1fr_110px] items-center gap-3 rounded-xl bg-zinc-900 px-3 py-3 text-zinc-100"
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
