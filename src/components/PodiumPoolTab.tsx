import { useMemo } from 'react'
import { TOURNAMENT_START_DATE } from '../lib/tournament'

type MatchPrediction = {
  voterUserId: string
  roundNumber: number
  matchNumber: number
  predictedWinnerUserId: string
}

type MatchVoteOption = {
  userId: string
  username: string
}

type MatchVoteCard = {
  roundNumber: number
  matchNumber: number
  winnerUserId: string | null
  player1: MatchVoteOption
  player2: MatchVoteOption | null
}

type MatchVoteRound = {
  roundNumber: number
  matches: MatchVoteCard[]
}

type PodiumPoolTabProps = {
  isTournamentDate: boolean
  loading: boolean
  saving: boolean
  rounds: MatchVoteRound[]
  predictions: MatchPrediction[]
  myPredictionKeys: Set<string>
  onVote: (roundNumber: number, matchNumber: number, predictedWinnerUserId: string) => void
}

export function PodiumPoolTab({
  isTournamentDate,
  loading,
  saving,
  rounds,
  predictions,
  myPredictionKeys,
  onVote,
}: PodiumPoolTabProps) {
  const voteCountsByMatch = useMemo(() => {
    const counts = new Map<string, Map<string, number>>()

    for (const prediction of predictions) {
      const matchKey = `R${prediction.roundNumber}-M${prediction.matchNumber}`
      const currentMatchCounts = counts.get(matchKey) ?? new Map<string, number>()
      currentMatchCounts.set(
        prediction.predictedWinnerUserId,
        (currentMatchCounts.get(prediction.predictedWinnerUserId) ?? 0) + 1,
      )
      counts.set(matchKey, currentMatchCounts)
    }

    return counts
  }, [predictions])

  if (!isTournamentDate) {
    return (
      <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-6 shadow-lg backdrop-blur">
        <h2 className="text-2xl font-black text-zinc-900">Porra del podio</h2>
        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-semibold text-zinc-800">
            La porra se abrira el {TOURNAMENT_START_DATE.split('-').reverse().join('/')}.
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Podras predecir quienes quedaran 1o, 2o y 3o en el torneo.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-5 shadow-lg backdrop-blur sm:p-6">
      <div>
        <div>
          <h2 className="text-2xl font-black text-zinc-900">Porra del podio</h2>
          <p className="text-sm text-zinc-600">Elige podio final (1o, 2o y 3o). No puedes votarte a ti mismo.</p>
        </div>
      </div>

      {loading && (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
          Cargando rondas y votos...
        </p>
      )}

      {!loading && rounds.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
          Aun no hay combates disponibles para votar.
        </p>
      )}

      {!loading && rounds.length > 0 && (
        <div className="mt-4 space-y-4">
          {rounds.map((round) => (
            <article key={`vote-round-${round.roundNumber}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Ronda {round.roundNumber}</h3>
              <div className="mt-3 space-y-3">
                {round.matches.map((match) => {
                  const matchKey = `R${match.roundNumber}-M${match.matchNumber}`
                  const alreadyVoted = myPredictionKeys.has(matchKey)
                  const voteCounts = voteCountsByMatch.get(matchKey) ?? new Map<string, number>()
                  const player2 = match.player2
                  const isPlayable = Boolean(match.player2) && !match.winnerUserId

                  return (
                    <div key={matchKey} className="rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-zinc-800">
                          Combate {match.matchNumber}: {match.player1.username} vs {match.player2?.username ?? 'BYE'}
                        </p>
                        {match.winnerUserId ? (
                          <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">Finalizado</span>
                        ) : (
                          <span className="text-xs font-bold uppercase tracking-wide text-amber-700">Abierto</span>
                        )}
                      </div>

                      {!isPlayable ? (
                        <p className="mt-2 text-xs text-zinc-500">Sin votacion disponible para este combate.</p>
                      ) : alreadyVoted ? (
                        <p className="mt-2 text-xs font-semibold text-emerald-700">Voto registrado. No se puede modificar.</p>
                      ) : (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => onVote(match.roundNumber, match.matchNumber, match.player1.userId)}
                            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Votar a {match.player1.username}
                          </button>
                          {player2 && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => onVote(match.roundNumber, match.matchNumber, player2.userId)}
                              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Votar a {player2.username}
                            </button>
                          )}
                        </div>
                      )}

                      {player2 && (
                        <div className="mt-3 grid gap-2 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700 sm:grid-cols-2">
                          <p>{match.player1.username}: {voteCounts.get(match.player1.userId) ?? 0} votos</p>
                          <p>{player2.username}: {voteCounts.get(player2.userId) ?? 0} votos</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
