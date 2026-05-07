import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthScreen } from './components/AuthScreen'
import { HsvPicker } from './components/HsvPicker'
import { Leaderboard } from './components/Leaderboard'
import { colorErrorPercent, hsvToHex } from './lib/colorMath'
import { dailyTargetColor, todayKey } from './lib/dailyChallenge'
import { difficultyDescription, previewSecondsByDifficulty, scoreAttempt, timeCaps } from './lib/scoring'
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
const WARMUP_START_DATE = '2026-05-06'
const WARMUP_MAX_USES = 3
const BIRTHDAY_BONUS_SECONDS = 10
const BIRTHDAY_USERNAME = 'lucas'
const NO_TIMER_USERNAME = 'lara'

const normalizeUsername = (value: string): string => value.trim().toLowerCase()
const isDaySeven = (dateKey: string): boolean => dateKey.split('-')[2] === '07'

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
  const [pickElapsedSeconds, setPickElapsedSeconds] = useState(0)
  const [pickerHsv, setPickerHsv] = useState<HSV>(defaultHsv)
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [result, setResult] = useState<ResultState | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [dailyLeaderboard, setDailyLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardTab, setLeaderboardTab] = useState<'daily' | 'general'>('daily')
  const [viewDate, setViewDate] = useState<string>(() => todayKey())
  const [hasPlayedOnViewDate, setHasPlayedOnViewDate] = useState(false)
  const [isPracticeMode, setIsPracticeMode] = useState(false)
  const [practiceTargetHex, setPracticeTargetHex] = useState<string | null>(null)
  const [challengeDate, setChallengeDate] = useState<string | null>(null)
  const [warmupUsesLeft, setWarmupUsesLeft] = useState(0)

  const date = useMemo(() => todayKey(), [])
  const displayDate = useMemo(() => {
    const [year, month, day] = viewDate.split('-')
    return `${day}/${month}/${year}`
  }, [viewDate])
  const currentUsername = useMemo(() => {
    const metadataUsername = session?.user.user_metadata?.username
    if (typeof metadataUsername === 'string' && metadataUsername.trim().length > 0) {
      return metadataUsername.trim()
    }
    return fallbackUsername(session?.user.email, session?.user.id ?? 'anon')
  }, [session])
  const isLucasUser = useMemo(
    () => normalizeUsername(currentUsername) === BIRTHDAY_USERNAME,
    [currentUsername],
  )
  const isLaraUser = useMemo(
    () => normalizeUsername(currentUsername) === NO_TIMER_USERNAME,
    [currentUsername],
  )
  const isLucasBirthdayToday = useMemo(
    () => isLucasUser && isDaySeven(date),
    [isLucasUser, date],
  )
  const targetHex = useMemo(() => dailyTargetColor(date), [date])
  const challengeTargetHex = useMemo(
    () => isPracticeMode ? (practiceTargetHex ?? targetHex) : dailyTargetColor(challengeDate ?? date),
    [isPracticeMode, practiceTargetHex, targetHex, challengeDate, date],
  )
  const activeTargetHex = challengeTargetHex
  const selectedHex = useMemo(() => hsvToHex(pickerHsv), [pickerHsv])
  const canUseWarmupFeature = date >= WARMUP_START_DATE
  const warmupStorageKey = session ? `warmup-uses:${session.user.id}:${date}` : null
  const activeChallengeDateKey = challengeDate ?? date
  const hasBirthdayBonusForActiveChallenge =
    !isPracticeMode && isLucasUser && isDaySeven(activeChallengeDateKey)
  const activeTimeCap = difficulty
    ? timeCaps[difficulty] + (hasBirthdayBonusForActiveChallenge ? BIRTHDAY_BONUS_SECONDS : 0)
    : 0

  const refreshDailyLeaderboard = useCallback(async (dateKey: string) => {
    if (!session) {
      return
    }

    setLoadingData(true)
    setErrorText(null)

    const [{ data: ownAttempt }, { data: dailyAttemptsData, error: dailyError }] =
      await Promise.all([
        supabase
          .from('attempts')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('date', dateKey)
          .maybeSingle(),
        supabase
          .from('attempts')
          .select('user_id,score,user_color,target_color')
          .eq('date', dateKey),
      ])

    if (dailyError) {
      setErrorText(dailyError.message ?? 'No se pudo cargar la clasificacion diaria.')
      setLoadingData(false)
      return
    }

    setHasPlayedOnViewDate(Boolean(ownAttempt))

    const dailyAttempts = dailyAttemptsData ?? []
    const dailyUserIds = [...new Set(dailyAttempts.map((a) => a.user_id))]

    let usernameById: Record<string, string> = {}

    if (dailyUserIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id,username')
        .in('id', dailyUserIds)

      usernameById = (profilesData ?? []).reduce<Record<string, string>>((acc, profile) => {
        acc[profile.id] = profile.username
        return acc
      }, {})
    }

    const dailyAggregated = dailyUserIds.map((uid) => {
      const userAttempts = dailyAttempts.filter((a) => a.user_id === uid)
      return {
        userId: uid,
        username: (() => {
          const baseUsername =
            usernameById[uid] ??
            fallbackUsername(
              uid === session.user.id ? session.user.email : undefined,
              uid,
            )

          if (isDaySeven(dateKey) && normalizeUsername(baseUsername) === BIRTHDAY_USERNAME) {
            return `${baseUsername} 👑`
          }

          return baseUsername
        })(),
        totalScore: userAttempts.reduce((sum, a) => sum + a.score, 0),
        gamesPlayed: userAttempts.length,
        userColor: userAttempts[0]?.user_color,
        targetColor: userAttempts[0]?.target_color,
      }
    })
    dailyAggregated.sort((a, b) => b.totalScore - a.totalScore)
    setDailyLeaderboard(dailyAggregated)

    setLoadingData(false)
  }, [session])

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
    if (!session) {
      return
    }
    void refreshDailyLeaderboard(viewDate)
  }, [viewDate, refreshDailyLeaderboard, session])

  useEffect(() => {
    if (!session || !warmupStorageKey || !canUseWarmupFeature) {
      setWarmupUsesLeft(0)
      return
    }

    if (isLaraUser) {
      setWarmupUsesLeft(WARMUP_MAX_USES)
      window.localStorage.setItem(warmupStorageKey, String(WARMUP_MAX_USES))
      return
    }

    const savedUses = window.localStorage.getItem(warmupStorageKey)
    const parsedUses = savedUses ? Number.parseInt(savedUses, 10) : Number.NaN
    const initialUses = Number.isFinite(parsedUses)
      ? Math.max(0, Math.min(WARMUP_MAX_USES, parsedUses))
      : WARMUP_MAX_USES

    setWarmupUsesLeft(initialUses)
    if (!savedUses) {
      window.localStorage.setItem(warmupStorageKey, String(initialUses))
    }
  }, [session, warmupStorageKey, canUseWarmupFeature, isLaraUser])

  useEffect(() => {
    if (stage !== 'preview' || !difficulty) {
      return
    }

    const total = previewSecondsByDifficulty[difficulty]
    setPreviewCountdown(total)

    if (isLaraUser) {
      const timeout = window.setTimeout(() => {
        setStage('pick')
        setPickStartedAt(Date.now())
      }, total * 1000)

      return () => window.clearTimeout(timeout)
    }

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
  }, [difficulty, isLaraUser, stage])

  useEffect(() => {
    if (stage !== 'pick' || !difficulty || pickStartedAt === null) {
      return
    }

    if (isLaraUser) {
      return
    }

    const tick = () => {
      setPickElapsedSeconds((Date.now() - pickStartedAt) / 1000)
    }

    tick()
    const interval = window.setInterval(tick, 100)
    return () => window.clearInterval(interval)
  }, [difficulty, isLaraUser, pickStartedAt, stage])

  // Skip preview immediately on PrintScreen or window blur/visibility change
  useEffect(() => {
    if (stage !== 'preview') {
      return
    }

    const skipToPickNow = () => {
      setStage('pick')
      setPickStartedAt(Date.now())
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault()
        skipToPickNow()
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        skipToPickNow()
      }
    }

    const handleBlur = () => skipToPickNow()

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
    }
  }, [stage])

  const beginChallenge = () => {
    if (hasPlayedToday) {
      return
    }
    setIsPracticeMode(false)
    setPracticeTargetHex(null)
    setChallengeDate(null)
    setErrorText(null)
    setResult(null)
    setDifficulty('hard')
    setPickerHsv(defaultHsv)
    setStage('preview')
  }

  const beginPracticeChallenge = () => {
    if (!canUseWarmupFeature || hasPlayedToday || warmupUsesLeft <= 0 || !warmupStorageKey) {
      return
    }

    if (isLaraUser) {
      setWarmupUsesLeft(WARMUP_MAX_USES)
      window.localStorage.setItem(warmupStorageKey, String(WARMUP_MAX_USES))

      setIsPracticeMode(true)
      setPracticeTargetHex(randomPracticeHex())
      setChallengeDate(null)
      setErrorText(null)
      setResult(null)
      setDifficulty('hard')
      setPickerHsv(defaultHsv)
      setStage('preview')
      return
    }

    const nextUses = warmupUsesLeft - 1
    setWarmupUsesLeft(nextUses)
    window.localStorage.setItem(warmupStorageKey, String(nextUses))

    setIsPracticeMode(true)
    setPracticeTargetHex(randomPracticeHex())
    setChallengeDate(null)
    setErrorText(null)
    setResult(null)
    setDifficulty('hard')
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
    const effectiveSeconds = hasBirthdayBonusForActiveChallenge
      ? Math.max(0, elapsedSeconds - BIRTHDAY_BONUS_SECONDS)
      : elapsedSeconds
    const error = colorErrorPercent(activeTargetHex, selectedHex)
    const score = scoreAttempt(error, effectiveSeconds, difficulty, activeTimeCap)

    if (isPracticeMode) {
      setResult({
        targetHex: activeTargetHex,
        userHex: selectedHex,
        error,
        score,
        seconds: effectiveSeconds,
        difficulty,
      })
      setStage('result')
      setSubmitting(false)
      return
    }

    const { error: insertError } = await supabase.from('attempts').insert({
      user_id: session.user.id,
      date: challengeDate ?? date,
      difficulty,
      target_color: dailyTargetColor(challengeDate ?? date),
      user_color: selectedHex,
      error,
      time: effectiveSeconds,
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
      seconds: effectiveSeconds,
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
    <div className="bg-animated min-h-screen px-3 py-6 text-zinc-900 sm:px-4 sm:py-8">
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
            {canUseWarmupFeature && (
              <button
                type="button"
                onClick={beginPracticeChallenge}
                disabled={loadingData || hasPlayedToday || warmupUsesLeft <= 0}
                className="rounded-lg border border-amber-400 bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {hasPlayedToday
                  ? 'Calentamiento bloqueado'
                  : `Calentamiento (${warmupUsesLeft}/${WARMUP_MAX_USES})`}
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

        {isLucasBirthdayToday && (
          <p className="rounded-xl border border-amber-300 bg-amber-100 p-3 text-sm font-semibold text-amber-900">
            Feliz cumpleanos, Lucas. Hoy tienes +{BIRTHDAY_BONUS_SECONDS}s en el reto diario.
          </p>
        )}

        {errorText && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{errorText}</p>}

        {stage === 'home' && (
          <div className="space-y-4">
            <div className="flex rounded-2xl border border-zinc-900/10 bg-white/80 p-1 shadow backdrop-blur">
              <button
                type="button"
                onClick={() => setLeaderboardTab('daily')}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                  leaderboardTab === 'daily'
                    ? 'bg-zinc-900 text-zinc-100 shadow'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Diaria
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardTab('general')}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                  leaderboardTab === 'general'
                    ? 'bg-zinc-900 text-zinc-100 shadow'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                General
              </button>
            </div>
            {leaderboardTab === 'daily' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-900/10 bg-white/80 px-3 py-2 shadow backdrop-blur">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(viewDate + 'T00:00:00Z')
                      d.setUTCDate(d.getUTCDate() - 1)
                      setViewDate(d.toISOString().slice(0, 10))
                    }}
                    className="rounded-lg px-3 py-1 text-lg font-bold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30"
                    aria-label="Dia anterior"
                  >
                    ‹
                  </button>
                  <span className="text-sm font-semibold text-zinc-700">{displayDate}</span>
                  <button
                    type="button"
                    disabled={viewDate >= date}
                    onClick={() => {
                      const d = new Date(viewDate + 'T00:00:00Z')
                      d.setUTCDate(d.getUTCDate() + 1)
                      setViewDate(d.toISOString().slice(0, 10))
                    }}
                    className="rounded-lg px-3 py-1 text-lg font-bold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30"
                    aria-label="Dia siguiente"
                  >
                    ›
                  </button>
                </div>
                <Leaderboard
                  entries={dailyLeaderboard}
                  title={`Clasificacion${viewDate === date ? ' del dia' : ''} · ${displayDate}`}
                  showColors={viewDate < date || hasPlayedOnViewDate}
                />
              </div>
            ) : (
              <Leaderboard entries={leaderboard} title="Clasificacion general" />
            )}
          </div>
        )}

        {stage === 'preview' && difficulty && (
          <section className="rounded-3xl border border-zinc-900/10 bg-white/85 p-8 text-center shadow-lg backdrop-blur">
            <p className="text-sm text-zinc-500">Memoriza este color</p>
            <div className="mx-auto mt-4 h-52 w-full max-w-md rounded-3xl border border-zinc-900/15 shadow-inner transition-opacity duration-500" style={{ backgroundColor: activeTargetHex }} />
            {!isLaraUser && (
              <p className="mt-4 text-4xl font-black text-zinc-900">{previewCountdown.toFixed(1)}s</p>
            )}
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
              <div className="rounded-2xl border border-zinc-900/10 bg-zinc-50 p-3">
                {!isLaraUser && (
                  <>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Tiempo y bonus estimado</p>
                    <p className="mt-2 text-sm text-zinc-700">
                      Cuenta regresiva: <span className="font-semibold">{Math.max(0, activeTimeCap - pickElapsedSeconds).toFixed(1)}s</span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-700">
                      Bonus de tiempo si confirmas ahora: <span className="font-semibold">{(Math.max(0, 1 - pickElapsedSeconds / activeTimeCap) * 100).toFixed(1)}</span> pts
                    </p>
                  </>
                )}
                {hasBirthdayBonusForActiveChallenge && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    Feliz cumpleanos: +{BIRTHDAY_BONUS_SECONDS}s de margen para este reto.
                  </p>
                )}
              </div>
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
