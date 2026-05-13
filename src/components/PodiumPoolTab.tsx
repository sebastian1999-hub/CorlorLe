import { useEffect, useMemo, useState } from 'react'
import { TOURNAMENT_START_DATE } from '../lib/tournament'

type PodiumParticipant = {
  userId: string
  username: string
  seed: number
}

type PodiumPrediction = {
  voterUserId: string
  firstUserId: string
  secondUserId: string
  thirdUserId: string
}

type PodiumPoolTabProps = {
  isTournamentDate: boolean
  loading: boolean
  saving: boolean
  currentUserId: string
  participants: PodiumParticipant[]
  predictions: PodiumPrediction[]
  myPrediction: PodiumPrediction | null
  onSave: (firstUserId: string, secondUserId: string, thirdUserId: string) => void
  onRefresh: () => void
}

const isValidPodium = (firstUserId: string, secondUserId: string, thirdUserId: string): boolean => {
  const picks = [firstUserId, secondUserId, thirdUserId]
  return picks.every((pick) => pick.length > 0) && new Set(picks).size === 3
}

export function PodiumPoolTab({
  isTournamentDate,
  loading,
  saving,
  currentUserId,
  participants,
  predictions,
  myPrediction,
  onSave,
  onRefresh,
}: PodiumPoolTabProps) {
  const [firstUserId, setFirstUserId] = useState('')
  const [secondUserId, setSecondUserId] = useState('')
  const [thirdUserId, setThirdUserId] = useState('')

  useEffect(() => {
    if (!myPrediction) {
      setFirstUserId('')
      setSecondUserId('')
      setThirdUserId('')
      return
    }

    setFirstUserId(myPrediction.firstUserId)
    setSecondUserId(myPrediction.secondUserId)
    setThirdUserId(myPrediction.thirdUserId)
  }, [myPrediction])

  const usernameById = useMemo(() => {
    return participants.reduce<Record<string, string>>((acc, participant) => {
      acc[participant.userId] = participant.username
      return acc
    }, {})
  }, [participants])

  const availableParticipants = useMemo(() => {
    return participants.filter((participant) => participant.userId !== currentUserId)
  }, [participants, currentUserId])

  const firstPlaceVotes = useMemo(() => {
    const voteMap = new Map<string, number>()

    for (const prediction of predictions) {
      voteMap.set(prediction.firstUserId, (voteMap.get(prediction.firstUserId) ?? 0) + 1)
    }

    return Array.from(voteMap.entries())
      .map(([userId, votes]) => ({
        userId,
        username: usernameById[userId] ?? userId,
        votes,
      }))
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 5)
  }, [predictions, usernameById])

  const canSave =
    isValidPodium(firstUserId, secondUserId, thirdUserId) &&
    firstUserId !== currentUserId &&
    secondUserId !== currentUserId &&
    thirdUserId !== currentUserId

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-zinc-900">Porra del podio</h2>
          <p className="text-sm text-zinc-600">Elige podio final (1o, 2o y 3o). No puedes votarte a ti mismo.</p>
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
          Cargando participantes y porras...
        </p>
      )}

      {!loading && availableParticipants.length < 3 && (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
          Todavia no hay suficientes participantes para completar una porra de podio.
        </p>
      )}

      {!loading && availableParticipants.length >= 3 && (
        <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Tu porra</h3>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-600">1o puesto</span>
                <select
                  value={firstUserId}
                  onChange={(event) => setFirstUserId(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                >
                  <option value="">Selecciona jugador</option>
                  {availableParticipants
                    .filter((participant) => participant.userId !== secondUserId && participant.userId !== thirdUserId)
                    .map((participant) => (
                      <option key={`first-${participant.userId}`} value={participant.userId}>
                        #{participant.seed} {participant.username}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-600">2o puesto</span>
                <select
                  value={secondUserId}
                  onChange={(event) => setSecondUserId(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                >
                  <option value="">Selecciona jugador</option>
                  {availableParticipants
                    .filter((participant) => participant.userId !== firstUserId && participant.userId !== thirdUserId)
                    .map((participant) => (
                      <option key={`second-${participant.userId}`} value={participant.userId}>
                        #{participant.seed} {participant.username}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-600">3o puesto</span>
                <select
                  value={thirdUserId}
                  onChange={(event) => setThirdUserId(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                >
                  <option value="">Selecciona jugador</option>
                  {availableParticipants
                    .filter((participant) => participant.userId !== firstUserId && participant.userId !== secondUserId)
                    .map((participant) => (
                      <option key={`third-${participant.userId}`} value={participant.userId}>
                        #{participant.seed} {participant.username}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() => onSave(firstUserId, secondUserId, thirdUserId)}
              disabled={!canSave || saving}
              className="mt-4 w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Guardando porra...' : myPrediction ? 'Actualizar porra' : 'Guardar porra'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Resumen</h3>
              <p className="mt-2 text-sm text-zinc-700">Porras registradas: {predictions.length}</p>
              {myPrediction ? (
                <div className="mt-3 space-y-1 text-sm text-zinc-700">
                  <p>1o: <span className="font-semibold">{usernameById[myPrediction.firstUserId] ?? myPrediction.firstUserId}</span></p>
                  <p>2o: <span className="font-semibold">{usernameById[myPrediction.secondUserId] ?? myPrediction.secondUserId}</span></p>
                  <p>3o: <span className="font-semibold">{usernameById[myPrediction.thirdUserId] ?? myPrediction.thirdUserId}</span></p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-600">Aun no has enviado tu porra.</p>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-zinc-700">Favoritos al 1o puesto</h3>
              <div className="mt-2 space-y-2">
                {firstPlaceVotes.length === 0 ? (
                  <p className="text-sm text-zinc-600">Sin votos todavia.</p>
                ) : (
                  firstPlaceVotes.map((entry) => (
                    <div key={`vote-${entry.userId}`} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <p className="text-sm font-semibold text-zinc-800">{entry.username}</p>
                      <span className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-bold text-zinc-100">{entry.votes} votos</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
