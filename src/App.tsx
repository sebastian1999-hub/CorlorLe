import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthScreen } from './components/AuthScreen'
import { DifficultyPicker } from './components/DifficultyPicker'
import { HsvPicker } from './components/HsvPicker'
import { Leaderboard } from './components/Leaderboard'
import { colorErrorPercent, hsvToHex } from './lib/colorMath'
import { dailyTargetColor, todayKey } from './lib/dailyChallenge'
import { difficultyDescription, previewSecondsByDifficulty, scoreAttempt } from './lib/scoring'
import { supabase } from './lib/supabase'
import type { Difficulty, HSV, LeaderboardEntry } from './types'

type Stage = 'home' | 'difficulty' | 'preview' | 'pick' | 'result'

type ResultState = {
  targetHex: string
  userHex: string
  error: number
  score: number
  seconds: number
  difficulty: Difficulty
}

const defaultHsv: HSV = { h: 200, s: 70, v: 70 }

const randomPracticeHex = (): string => {
  const h = Math.floor(Math.random() * 360)
  const s = 45 + Math.random() * 50
  const v = 50 + Math.random() * 45
  return hsvToHex({ h, s, v })
}

const fallbackUsername = (email: string | null | undefined, userId: string): string => {
  if (!email) {
    return `player-${userId.slice(0, 6)}`
  }
  return email.split('@')[0]
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(true)
  const [hasPlayedToday, setHasPlayedToday] = useState(false)
  const [stage, setStage] = useState<Stage>('home')
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const [previewCountdown, setPreviewCountdown] = useState(0)
  const [pickStartedAt, setPickStartedAt] = useState<number | null>(null)
  const [pickerHsv, setPickerHsv] = useState<HSV>(defaultHsv)
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [result, setResult] = useState<ResultState | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [isPracticeMode, setIsPracticeMode] = useState(false)
  const [practiceTargetHex, setPracticeTargetHex] = useState<string | null>(null)

  const date = useMemo(() => todayKey(), [])
  const displayDate = useMemo(() => {
    const [year, month, day] = date.split('-')
    return `${day}/${month}/${year}`
  }, [date])
  const targetHex = useMemo(() => dailyTargetColor(date), [date])
  const activeTargetHex = isPracticeMode ? (practiceTargetHex ?? targetHex) : targetHex
  const selectedHex = useMemo(() => hsvToHex(pickerHsv), [pickerHsv])
  const PRACTICE_USERS = ['admin@gmail.com', 'alicia@gmail.com']
  const isAdmin =
    session?.user.app_metadata?.role === 'admin' ||
    session?.user.user_metadata?.username === 'Admin' ||
    (session?.user.email !== undefined &&
      PRACTICE_USERS.includes(session.user.email.toLowerCase()))

  const refreshDailyState = useCallback(async () => {
    if (!session) {
      return
    }

    setLoadingData(true)
    setErrorText(null)

    const [{ data: ownAttempt, error: ownError }, { data: allAttemptsData, error: leaderboardError }] =
      await Promise.all([
        supabase
          .from('attempts')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('date', date)
          .maybeSingle(),
        supabase
          .from('attempts')
          .select('user_id,score'),
      ])

    if (ownError || leaderboardError) {
      setErrorText((ownError || leaderboardError)?.message ?? 'No se pudo cargar el estado diario.')
      setLoadingData(false)
      return
    }

    setHasPlayedToday(Boolean(ownAttempt))

    const attempts = allAttemptsData ?? []
    const userIds = [...new Set(attempts.map((attempt) => attempt.user_id))]

    let usernameById: Record<string, string> = {}

    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id,username')
        .in('id', userIds)

      usernameById = (profilesData ?? []).reduce<Record<string, string>>((acc, profile) => {
        acc[profile.id] = profile.username
        return acc
      }, {})
    }

    // Aggregate all-time scores per user
    const aggregated = userIds.map((uid) => {
      const userAttempts = attempts.filter((a) => a.user_id === uid)
      return {
        userId: uid,
        username:
          usernameById[uid] ??
          fallbackUsername(
            uid === session.user.id ? session.user.email : undefined,
            uid,
          ),
        totalScore: userAttempts.reduce((sum, a) => sum + a.score, 0),
        gamesPlayed: userAttempts.length,
      }
    })
    aggregated.sort((a, b) => b.totalScore - a.totalScore)

    setLeaderboard(aggregated)

    setLoadingData(false)
  }, [date, session])

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setAuthLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setStage('home')
      setResult(null)
      setHasPlayedToday(false)
      setIsPracticeMode(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const upsertProfile = async () => {
      if (!session) {
        return
      }

      const metadataUsername = session.user.user_metadata?.username
      const username =
        typeof metadataUsername === 'string' && metadataUsername.trim().length > 0
          ? metadataUsername.trim()
          : fallbackUsername(session.user.email, session.user.id)

      await supabase.from('profiles').upsert(
        {
          id: session.user.id,
          username,
        },
        { onConflict: 'id' },
      )
    }

    void upsertProfile()
  }, [session])

  useEffect(() => {
    if (!session) {
      return
    }
    void refreshDailyState()
  }, [refreshDailyState, session])

  useEffect(() => {
    if (stage !== 'preview' || !difficulty) {
      return
    }

    const total = previewSecondsByDifficulty[difficulty]
    setPreviewCountdown(total)

    const started = Date.now()
    const interval = window.setInterval(() => {
      const elapsed = (Date.now() - started) / 1000
      const remaining = Math.max(0, total - elapsed)
      setPreviewCountdown(remaining)

      if (remaining <= 0) {
        window.clearInterval(interval)
        setStage('pick')
        setPickStartedAt(Date.now())
      }
    }, 50)

    return () => window.clearInterval(interval)
  }, [difficulty, stage])

  const beginChallenge = () => {
    if (hasPlayedToday) {
      return
    }
    setIsPracticeMode(false)
    setPracticeTargetHex(null)
    setErrorText(null)
    setResult(null)
    setStage('difficulty')
  }

  const beginPracticeChallenge = () => {
    if (!isAdmin) {
      return
    }
    setIsPracticeMode(true)
    setPracticeTargetHex(randomPracticeHex())
    setErrorText(null)
    setResult(null)
    setStage('difficulty')
  }

  const handleDifficulty = (selectedDifficulty: Difficulty) => {
    setDifficulty(selectedDifficulty)
    setPickerHsv(defaultHsv)
    setStage('preview')
  }

  const handleConfirm = async () => {
    if (!session || !difficulty || pickStartedAt === null || submitting) {
      return
    }

    setSubmitting(true)
    setErrorText(null)

    const elapsedSeconds = (Date.now() - pickStartedAt) / 1000
    const error = colorErrorPercent(activeTargetHex, selectedHex)
    const score = scoreAttempt(error, elapsedSeconds, difficulty)

    if (isPracticeMode && isAdmin) {
      setResult({
        targetHex: activeTargetHex,
        userHex: selectedHex,
        error,
        score,
        seconds: elapsedSeconds,
        difficulty,
      })
      setStage('result')
      setSubmitting(false)
      return
    }

    const { error: insertError } = await supabase.from('attempts').insert({
      user_id: session.user.id,
      date,
      difficulty,
      target_color: targetHex,
      user_color: selectedHex,
      error,
      time: elapsedSeconds,
      score,
    })

    if (insertError) {
      if (insertError.code === '23505') {
        setHasPlayedToday(true)
        setStage('home')
        setErrorText('Ya registraste tu intento de hoy.')
      } else {
        setErrorText(insertError.message)
      }

      setSubmitting(false)
      await refreshDailyState()
      return
    }

    setResult({
      targetHex: activeTargetHex,
      userHex: selectedHex,
      error,
      score,
      seconds: elapsedSeconds,
      difficulty,
    })
    setHasPlayedToday(true)
    setStage('result')
    setSubmitting(false)
    await refreshDailyState()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  if (authLoading) {
    return <p className="p-8 text-center">Cargando sesion...</p>
  }

  if (!session) {
    return <AuthScreen />
  }

  return (
    <div className="bg-animated min-h-screen px-4 py-8 text-zinc-900">
      <main className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-zinc-900/10 bg-white/80 p-6 shadow-lg backdrop-blur md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-black">Reto PreAltet</h1>
            <p className="text-sm text-zinc-600">Reto de hoy: {displayDate}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={beginChallenge}
              disabled={hasPlayedToday || loadingData}
              className="rounded-lg bg-zinc-950 px-5 py-3 font-semibold text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {hasPlayedToday ? 'Reto ya completado' : 'Reto Diario'}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={beginPracticeChallenge}
                disabled={loadingData}
                className="rounded-lg border border-amber-400 bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Modo Prueba
              </button>
            )}
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-700 transition hover:bg-zinc-100"
            >
              Salir
            </button>
          </div>
        </header>

        {errorText && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{errorText}</p>}

        {stage === 'home' && <Leaderboard entries={leaderboard} />}

        {stage === 'difficulty' && (
          <DifficultyPicker onSelect={handleDifficulty} onCancel={() => setStage('home')} />
        )}

        {stage === 'preview' && difficulty && (
          <section className="rounded-3xl border border-zinc-900/10 bg-white/85 p-8 text-center shadow-lg backdrop-blur">
            <p className="text-sm text-zinc-500">Memoriza este color</p>
            <div className="mx-auto mt-4 h-52 w-full max-w-md rounded-3xl border border-zinc-900/15 shadow-inner transition-opacity duration-500" style={{ backgroundColor: activeTargetHex }} />
            <p className="mt-4 text-4xl font-black text-zinc-900">{previewCountdown.toFixed(1)}s</p>
            <p className="mt-2 text-sm text-zinc-600">{difficultyDescription[difficulty]}</p>
          </section>
        )}

        {stage === 'pick' && difficulty && (
          <section className="grid gap-6 rounded-3xl border border-zinc-900/10 bg-white/85 p-6 shadow-lg backdrop-blur md:grid-cols-2">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-wide text-zinc-500">Color oculto</p>
              <div className="flex h-52 items-center justify-center rounded-3xl border border-dashed border-zinc-400 bg-zinc-100 text-zinc-500">
                Recrealo con tu memoria
              </div>
              <p className="text-sm text-zinc-600">Dificultad: {difficulty.toUpperCase()}</p>
            </div>

            <div className="space-y-4">
              <HsvPicker value={pickerHsv} onChange={setPickerHsv} />
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Guardando intento...' : 'Confirmar'}
              </button>
            </div>
          </section>
        )}

        {stage === 'result' && result && (
          <section className="rounded-3xl border border-zinc-900/10 bg-white/85 p-6 shadow-lg backdrop-blur">
            <h2 className="text-2xl font-black text-zinc-900">Resultado del dia</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm text-zinc-600">Color objetivo</p>
                <div className="h-40 rounded-2xl border border-zinc-900/15" style={{ backgroundColor: result.targetHex }} />
                <p className="mt-2 font-mono text-sm text-zinc-700">{result.targetHex.toUpperCase()}</p>
              </div>
              <div>
                <p className="mb-2 text-sm text-zinc-600">Tu color</p>
                <div className="h-40 rounded-2xl border border-zinc-900/15" style={{ backgroundColor: result.userHex }} />
                <p className="mt-2 font-mono text-sm text-zinc-700">{result.userHex.toUpperCase()}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 rounded-2xl bg-zinc-950 p-4 text-zinc-100 md:grid-cols-4">
              <p>
                <span className="block text-xs text-zinc-400">Error</span>
                <span className="text-xl font-bold">{result.error.toFixed(2)}%</span>
              </p>
              <p>
                <span className="block text-xs text-zinc-400">Tiempo</span>
                <span className="text-xl font-bold">{result.seconds.toFixed(2)}s</span>
              </p>
              <p>
                <span className="block text-xs text-zinc-400">Dificultad</span>
                <span className="text-xl font-bold uppercase">{result.difficulty}</span>
              </p>
              <p>
                <span className="block text-xs text-zinc-400">Score</span>
                <span className="text-xl font-bold text-emerald-300">{result.score.toFixed(2)}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStage('home')}
              className="mt-5 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
            >
              Volver al leaderboard
            </button>
          </section>
        )}

        {loadingData && stage === 'home' && (
          <p className="rounded-xl border border-dashed border-zinc-400 p-3 text-center text-zinc-600">
            Cargando leaderboard...
          </p>
        )}
      </main>
    </div>
  )
}

export default App
