import { useEffect, useMemo, useState } from 'react'
import { DUELS_PER_MATCH, TOURNAMENT_START_DATE } from '../lib/tournament'

type TournamentPlayerProgress = {
  userId: string
  username: string
  attemptsDone: number
  totalScore: number
  revealColors: boolean
  duels: Array<{
    duelIndex: number
    done: boolean
    targetColor: string | null
    userColor: string | null
    score: number | null
    error: number | null
    result: 'win' | 'loss' | 'tie' | 'pending'
  }>
}

type TournamentMatchCard = {
  id: string
  roundNumber: number
  matchNumber: number
  winnerUserId: string | null
  player1DuelWins: number
  player2DuelWins: number
  player1: TournamentPlayerProgress
  player2: TournamentPlayerProgress | null
  canCurrentUserPlay: boolean
  isCurrentUserInMatch: boolean
}

type TournamentRound = {
  roundNumber: number
  matches: TournamentMatchCard[]
}

type TournamentTabProps = {
  isTournamentDate: boolean
  loading: boolean
  hasRun: boolean
  championName: string | null
  rounds: TournamentRound[]
  onPlayDuel: (matchId: string) => void
  onRefresh: () => void
}

const renderCounter = (player: TournamentPlayerProgress, duelWins?: number) => {
  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-zinc-100">{player.username}</p>
        {typeof duelWins === 'number' && (
          <span className="rounded-md border border-zinc-500 bg-zinc-800 px-2 py-0.5 text-xs font-black text-amber-300">
            {duelWins} pt
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-400">
        Duelos: {player.attemptsDone}/{DUELS_PER_MATCH}
      </p>
      <p className="text-sm font-bold text-emerald-300">{player.totalScore.toFixed(2)} pts</p>

      <div className="mt-3 space-y-2">
        {player.duels.map((duel) => (
          (() => {
            const duelRowClass =
              duel.result === 'win'
                ? 'bg-emerald-950/70 ring-1 ring-emerald-400/50'
                : duel.result === 'loss'
                  ? 'bg-rose-950/60 ring-1 ring-rose-400/35'
                  : duel.result === 'tie'
                    ? 'bg-amber-950/60 ring-1 ring-amber-300/40'
                    : 'bg-zinc-900'

            const duelLabelClass =
              duel.result === 'win'
                ? 'text-emerald-300'
                : duel.result === 'loss'
                  ? 'text-rose-300'
                  : duel.result === 'tie'
                    ? 'text-amber-300'
                    : 'text-zinc-300'

            const duelStatus =
              duel.result === 'win'
                ? 'Ganado'
                : duel.result === 'loss'
                  ? 'Perdido'
                  : duel.result === 'tie'
                    ? 'Empate'
                    : duel.done
                      ? 'Completado'
                      : 'Pendiente'

            return (
          <div
            key={`${player.userId}-duel-${duel.duelIndex}`}
            className={`grid grid-cols-[32px_1fr_auto_auto_auto] items-center gap-2 rounded-xl px-3 py-3 text-zinc-100 sm:grid-cols-[40px_1fr_110px_44px_44px] sm:gap-3 ${duelRowClass}`}
          >
            <span className="text-center font-bold text-amber-300">D{duel.duelIndex}</span>
            <div>
              <p className={`font-semibold ${duelLabelClass}`}>{duelStatus}</p>
              <p className="text-xs text-zinc-400">
                {duel.done
                  ? `${duel.error?.toFixed(2)}% de error`
                  : 'Aun sin intento'}
              </p>
            </div>
            <p className="text-right font-extrabold text-emerald-300">
              {duel.done ? duel.score?.toFixed(0) : '-'}
            </p>
            {player.revealColors && duel.targetColor ? (
              <div
                className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                style={{ backgroundColor: duel.targetColor }}
                title={`Objetivo: ${duel.targetColor}`}
              />
            ) : (
              <div
                className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                title={player.revealColors ? 'Objetivo pendiente' : 'Color oculto hasta completar tus 3 duelos de la ronda'}
              >
                <span className="flex h-full w-full items-center justify-center text-lg font-black text-zinc-200">?</span>
              </div>
            )}
            {player.revealColors && duel.userColor ? (
              <div
                className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                style={{ backgroundColor: duel.userColor }}
                title={`Conseguido: ${duel.userColor}`}
              />
            ) : (
              <div
                className="h-8 w-8 rounded border border-zinc-400 sm:h-10 sm:w-10"
                title={player.revealColors ? 'Color conseguido pendiente' : 'Color oculto hasta completar tus 3 duelos de la ronda'}
              >
                <span className="flex h-full w-full items-center justify-center text-lg font-black text-zinc-200">?</span>
              </div>
            )}
          </div>
            )
          })()
        ))}
      </div>
    </div>
  )
}

export function TournamentTab({
  isTournamentDate,
  loading,
  hasRun,
  championName,
  rounds,
  onPlayDuel,
  onRefresh,
}: TournamentTabProps) {
  const [openRoundNumbers, setOpenRoundNumbers] = useState<number[]>([])
  const [openMatchIds, setOpenMatchIds] = useState<string[]>([])

  const firstRoundNumber = useMemo(() => rounds[0]?.roundNumber ?? null, [rounds])

  useEffect(() => {
    if (firstRoundNumber === null) {
      setOpenRoundNumbers([])
      return
    }

    setOpenRoundNumbers((previous) => {
      if (previous.length === 0) {
        return [firstRoundNumber]
      }
      return previous.filter((roundNumber) => rounds.some((round) => round.roundNumber === roundNumber))
    })

    setOpenMatchIds((previous) => {
      return previous.filter((matchId) =>
        rounds.some((round) => round.matches.some((match) => match.id === matchId)),
      )
    })
  }, [firstRoundNumber, rounds])

  const toggleRound = (roundNumber: number) => {
    setOpenRoundNumbers((previous) =>
      previous.includes(roundNumber)
        ? previous.filter((value) => value !== roundNumber)
        : [...previous, roundNumber],
    )
  }

  const toggleMatch = (matchId: string) => {
    setOpenMatchIds((previous) =>
      previous.includes(matchId)
        ? previous.filter((value) => value !== matchId)
        : [...previous, matchId],
    )
  }

  if (!isTournamentDate) {
    return (
      <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-6 shadow-lg backdrop-blur">
        <h2 className="text-2xl font-black text-zinc-900">Torneo Eliminatorio</h2>
        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-semibold text-zinc-800">
            El torneo comenzara el {TOURNAMENT_START_DATE.split('-').reverse().join('/')}.
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Ese dia se revelaran los enfrentamientos del cuadro eliminatorio.
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Todos los duelos se jugaran al mejor de 3 intentos.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-5 shadow-lg backdrop-blur sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-zinc-900">Torneo Eliminatorio</h2>
          <p className="text-sm text-zinc-600">Formato al mejor de 3 duelos por emparejamiento.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
        >
          Actualizar
        </button>
      </div>

      {loading && (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
          Cargando cuadro del torneo...
        </p>
      )}

      {!loading && !hasRun && (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
          Aun no hay suficientes datos para crear el torneo.
        </p>
      )}

      {championName && (
        <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Campeon</p>
          <p className="text-xl font-black text-emerald-900">{championName}</p>
        </div>
      )}

      {!loading && rounds.length > 0 && (
        <div className="mt-5 space-y-4">
          {rounds.map((round) => {
            const isRoundOpen = openRoundNumbers.includes(round.roundNumber)

            return (
              <article key={round.roundNumber} className="rounded-2xl border border-zinc-900/10 bg-zinc-50 p-4">
                <button
                  type="button"
                  onClick={() => toggleRound(round.roundNumber)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-left transition hover:bg-zinc-100"
                >
                  <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Ronda {round.roundNumber}</h3>
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-semibold text-zinc-500">
                      {round.matches.filter((match) => Boolean(match.winnerUserId)).length}/{round.matches.length} finalizados
                    </p>
                    <span
                      className={`text-xs font-bold text-zinc-500 transition-transform duration-300 ${
                        isRoundOpen ? 'rotate-180' : ''
                      }`}
                    >
                      ▼
                    </span>
                  </div>
                </button>

                <div
                  className={`grid overflow-hidden transition-all duration-500 ease-in-out ${
                    isRoundOpen ? 'mt-3 max-h-[6000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="grid gap-3">
                    {round.matches.map((match) => {
                      const isMatchOpen = openMatchIds.includes(match.id)

                      return (
                        <div key={match.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                          <button
                            type="button"
                            onClick={() => toggleMatch(match.id)}
                            className="flex w-full items-center justify-between gap-2 text-left"
                          >
                            <p className="text-sm font-semibold text-zinc-700">
                              Emparejamiento #{match.matchNumber}: {match.player1.username} vs {match.player2?.username ?? 'BYE'}
                            </p>
                            <div className="flex items-center gap-3">
                              {match.winnerUserId && match.player2 && (
                                <p className="rounded-md border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs font-black text-zinc-800">
                                  {match.player1DuelWins}-{match.player2DuelWins}
                                </p>
                              )}
                              {match.winnerUserId ? (
                                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Finalizado</p>
                              ) : (
                                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">En curso</p>
                              )}
                              <span
                                className={`text-xs font-bold text-zinc-500 transition-transform duration-300 ${
                                  isMatchOpen ? 'rotate-180' : ''
                                }`}
                              >
                                ▼
                              </span>
                            </div>
                          </button>

                          <div
                            className={`overflow-hidden transition-all duration-500 ease-in-out ${
                              isMatchOpen ? 'mt-3 max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                            }`}
                          >
                            <div className="grid gap-2 sm:grid-cols-2">
                              {renderCounter(match.player1, match.player1DuelWins)}
                              {match.player2 ? (
                                renderCounter(match.player2, match.player2DuelWins)
                              ) : (
                                <div className="rounded-xl border border-emerald-400 bg-emerald-50 p-3">
                                  <p className="text-sm font-bold text-emerald-800">Pase directo</p>
                                  <p className="text-xs text-emerald-700">{match.player1.username} avanza por mejor posicion.</p>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-zinc-500">
                                {match.winnerUserId
                                  ? `Ganador: ${match.winnerUserId === match.player1.userId ? match.player1.username : match.player2?.username ?? '-'}`
                                  : 'Pendiente de finalizar'}
                              </p>
                              {match.isCurrentUserInMatch && match.player2 && (
                                <button
                                  type="button"
                                  onClick={() => onPlayDuel(match.id)}
                                  disabled={!match.canCurrentUserPlay}
                                  className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Realizar duelo
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
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
