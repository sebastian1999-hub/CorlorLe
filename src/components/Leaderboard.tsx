import type { LeaderboardEntry } from '../types'
import goldMedal from '../assets/oro.png'
import silverMedal from '../assets/copa-de-plata.png'
import bronzeMedal from '../assets/copa-de-bronce.png'

type LeaderboardProps = {
  entries: LeaderboardEntry[]
  title?: string
  showColors?: boolean
}

export function Leaderboard({ entries, title = 'Clasificacion general', showColors = true }: LeaderboardProps) {
  const topThree = entries.slice(0, 3)
  const byRank = {
    first: topThree[0],
    second: topThree[1],
    third: topThree[2],
  }

  const podiumLayout = [
    {
      rank: 2,
      badgeSrc: silverMedal,
      badgeAlt: 'Medalla de plata',
      entry: byRank.second,
      trophyClass: 'h-12 w-12',
      cardHeightClass: 'min-h-[18.5rem] sm:min-h-[19rem]',
      compareHeightClass: 'min-h-20 sm:min-h-24',
      borderClass: 'border-zinc-200',
    },
    {
      rank: 1,
      badgeSrc: goldMedal,
      badgeAlt: 'Medalla de oro',
      entry: byRank.first,
      trophyClass: 'h-16 w-16',
      cardHeightClass: 'min-h-[20.5rem] sm:min-h-[21rem]',
      compareHeightClass: 'min-h-28 sm:min-h-32',
      borderClass: 'border-zinc-200',
    },
    {
      rank: 3,
      badgeSrc: bronzeMedal,
      badgeAlt: 'Medalla de bronce',
      entry: byRank.third,
      trophyClass: 'h-11 w-11',
      cardHeightClass: 'min-h-[17.5rem] sm:min-h-[18rem]',
      compareHeightClass: 'min-h-[4.5rem] sm:min-h-20',
      borderClass: 'border-zinc-200',
    },
  ]

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-4 shadow-lg backdrop-blur sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-1">
        <h2 className="text-base font-bold text-zinc-900 sm:text-xl">{title}</h2>
        <p className="text-sm whitespace-nowrap text-zinc-500">Top 3 · {entries.length} jugadores</p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
          Aun no hay partidas. Se el primero en jugar.
        </p>
      ) : (
        <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
          {podiumLayout.map((slot) => (
            <article
              key={slot.rank}
              className={`rounded-2xl border bg-white p-2 shadow-sm sm:p-3 ${slot.cardHeightClass} ${slot.borderClass} ${slot.rank === 1 ? '-translate-y-2 sm:-translate-y-3' : ''}`}
            >
              {slot.entry ? (
                <>
                  <div className="mb-2 flex items-center justify-end">
                    <img src={slot.badgeSrc} alt={slot.badgeAlt} className={`${slot.trophyClass} object-contain`} />
                  </div>

                  <p className="truncate text-xs font-black text-zinc-900 sm:text-base">{slot.entry.username}</p>
                  <p className="mt-1 hidden text-xs text-zinc-500 sm:block">
                    {slot.entry.gamesPlayed} partida{slot.entry.gamesPlayed !== 1 ? 's' : ''}
                    {typeof slot.entry.accuracyPercent === 'number' && ` · ${slot.entry.accuracyPercent.toFixed(1)}% precision`}
                  </p>

                  <p className="mt-2 text-sm font-black text-zinc-700 sm:text-lg">{slot.entry.totalScore.toFixed(0)} pts</p>

                  <div className={`mt-2 grid grid-cols-2 gap-2 sm:mt-3 ${slot.compareHeightClass}`}>
                    {showColors ? (
                      slot.entry.targetColor ? (
                        <div
                          className="h-full rounded-xl border border-zinc-400"
                          style={{ backgroundColor: slot.entry.targetColor }}
                          title={`Objetivo: ${slot.entry.targetColor}`}
                        />
                      ) : (
                        <div className="h-full rounded-xl border border-zinc-300 bg-zinc-100" />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-xl border border-zinc-400 bg-zinc-100 text-sm font-black text-zinc-500">?</div>
                    )}

                    {showColors ? (
                      slot.entry.userColor ? (
                        <div
                          className="h-full rounded-xl border border-zinc-400"
                          style={{ backgroundColor: slot.entry.userColor }}
                          title={`Conseguido: ${slot.entry.userColor}`}
                        />
                      ) : (
                        <div className="h-full rounded-xl border border-zinc-300 bg-zinc-100" />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-xl border border-zinc-400 bg-zinc-100 text-sm font-black text-zinc-500">?</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-center text-zinc-500">
                  <img src={slot.badgeSrc} alt={slot.badgeAlt} className={`${slot.trophyClass} object-contain opacity-60`} />
                  <p className="mt-1 text-sm">Sin jugador</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
