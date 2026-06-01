import { useEffect, useState } from 'react'
import type { LeaderboardEntry } from '../types'
import goldMedal from '../assets/oro.png'
import silverMedal from '../assets/copa-de-plata.png'
import bronzeMedal from '../assets/copa-de-bronce.png'

type LeaderboardProps = {
  entries: LeaderboardEntry[]
  title?: string
  showColors?: boolean
  animationToken?: string
  onAvatarClick?: (entry: LeaderboardEntry) => void
}

export function Leaderboard({ entries, title = 'Clasificacion general', showColors = true, animationToken, onAvatarClick }: LeaderboardProps) {
  const medalByIndex = [
    { src: goldMedal, alt: 'Medalla de oro', className: 'h-10 w-10 sm:h-12 sm:w-12' },
    { src: silverMedal, alt: 'Medalla de plata', className: 'h-9 w-9 sm:h-11 sm:w-11' },
    { src: bronzeMedal, alt: 'Medalla de bronce', className: 'h-8 w-8 sm:h-10 sm:w-10' },
  ]
  const [visibleRows, setVisibleRows] = useState(0)
  const animationKey = animationToken ?? `${title}-${entries.length}`

  useEffect(() => {
    setVisibleRows(0)

    if (entries.length === 0) {
      return
    }

    const startTimeout = window.setTimeout(() => {
      setVisibleRows(1)

      const intervalId = window.setInterval(() => {
        setVisibleRows((previous) => {
          if (previous >= entries.length) {
            window.clearInterval(intervalId)
            return previous
          }

          return previous + 1
        })
      }, 300)

      return () => window.clearInterval(intervalId)
    }, 50)

    return () => window.clearTimeout(startTimeout)
  }, [animationKey, entries.length])

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-4 shadow-lg backdrop-blur sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-1">
        <h2 className="text-base font-bold text-zinc-900 sm:text-xl">{title}</h2>
        <p className="text-sm whitespace-nowrap text-zinc-500">Ranking diario · {entries.length} jugadores</p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
          Aun no hay partidas. Se el primero en jugar.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => {
            const rank = index + 1
            const medal = medalByIndex[index] ?? null
            const isVisible = index < visibleRows

            return (
              <article
                key={`${animationKey}-${entry.userId}-${rank}`}
                className={`flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-sm transition-all duration-300 ease-out will-change-transform ${
                  isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {medal ? (
                    <img src={medal.src} alt={medal.alt} className={`${medal.className} object-contain`} />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-600 text-xs font-black text-zinc-300 sm:h-10 sm:w-10 sm:text-sm">
                      {rank}
                    </div>
                  )}

                  {onAvatarClick ? (
                    <button
                      type="button"
                      onClick={() => onAvatarClick(entry)}
                      className="rounded-full transition hover:scale-105"
                      title={`Ver perfil de ${entry.username}`}
                    >
                      {entry.avatarUrl ? (
                        <img
                          src={entry.avatarUrl}
                          alt={`Avatar de ${entry.username}`}
                          className="h-8 w-8 rounded-full border border-zinc-600 object-cover sm:h-10 sm:w-10"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-[10px] font-black uppercase text-zinc-300 sm:h-10 sm:w-10 sm:text-xs">
                          {entry.username.slice(0, 2)}
                        </div>
                      )}
                    </button>
                  ) : entry.avatarUrl ? (
                    <img
                      src={entry.avatarUrl}
                      alt={`Avatar de ${entry.username}`}
                      className="h-8 w-8 rounded-full border border-zinc-600 object-cover sm:h-10 sm:w-10"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-[10px] font-black uppercase text-zinc-300 sm:h-10 sm:w-10 sm:text-xs">
                      {entry.username.slice(0, 2)}
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-zinc-100 sm:text-base">{entry.username}</p>
                    <p className="text-xs text-zinc-300">
                      {entry.gamesPlayed} partida{entry.gamesPlayed !== 1 ? 's' : ''}
                      {typeof entry.accuracyPercent === 'number' && ` · ${entry.accuracyPercent.toFixed(1)}% precision`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <p className="whitespace-nowrap text-sm font-black text-emerald-300 sm:text-base">{entry.totalScore.toFixed(0)} pts</p>
                  <div className="grid grid-cols-2 gap-1 sm:gap-2">
                    {showColors ? (
                      entry.targetColor ? (
                        <div
                          className="h-6 w-6 rounded-md border border-zinc-500 sm:h-7 sm:w-7"
                          style={{ backgroundColor: entry.targetColor }}
                          title={`Objetivo: ${entry.targetColor}`}
                        />
                      ) : (
                        <div className="h-6 w-6 rounded-md border border-zinc-700 bg-zinc-800 sm:h-7 sm:w-7" />
                      )
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 text-[10px] font-black text-zinc-300 sm:h-7 sm:w-7">?</div>
                    )}

                    {showColors ? (
                      entry.userColor ? (
                        <div
                          className="h-6 w-6 rounded-md border border-zinc-500 sm:h-7 sm:w-7"
                          style={{ backgroundColor: entry.userColor }}
                          title={`Conseguido: ${entry.userColor}`}
                        />
                      ) : (
                        <div className="h-6 w-6 rounded-md border border-zinc-700 bg-zinc-800 sm:h-7 sm:w-7" />
                      )
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 text-[10px] font-black text-zinc-300 sm:h-7 sm:w-7">?</div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
