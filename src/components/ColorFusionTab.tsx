
import { Fragment, useMemo, useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { hexToRgb, rgbToHex } from '../lib/colorMath'
import { supabase } from '../lib/supabase'
import tapSoundSrc from '../assets/crucigama-sounds/tap.wav'
import selectSoundSrc from '../assets/crucigama-sounds/select.wav'
import paintSoundSrc from '../assets/crucigama-sounds/paint.wav'
import correctSoundSrc from '../assets/crucigama-sounds/correct.wav'
import flipSoundSrc from '../assets/crucigama-sounds/flip.wav'
import completeSoundSrc from '../assets/crucigama-sounds/complete.wav'

type ColorFusionTabProps = {
  dateKey: string
  session: Session
  showGame: boolean
  selectedMode: CrucigamaMode
  onBackToHome: () => void
  onStartInfinite: () => void
}

type Target =
  | { type: 'row'; index: number }
  | { type: 'col'; index: number }

type FusionPuzzle = {
  size: number
  clues: Map<string, string>
  solvedRows: string[]
  solvedCols: string[]
}

type CrucigamaTabView = 'game' | 'leaderboard'
type CrucigamaIntroTab = 'daily' | 'infinite'
type LeaderboardMode = 'normal' | 'infinite'
export type CrucigamaMode = 'normal' | 'infinite'

type CrucigamaAttempt = {
  userId: string
  username: string
  avatarUrl?: string
  dateKey: string
  mode: CrucigamaMode
  seconds: number
  completedAt: string
}

type CrucigamaInfiniteEntry = {
  userId: string
  username: string
  avatarUrl?: string
  bestFloors: number
  runsPlayed: number
}

//
const CRUCIGAMA_LABEL = 'CruciGama'
const CRUCIGAMA_GRADIENT = ['#F97316', '#FB923C', '#FACC15', '#84CC16', '#22C55E', '#06B6D4', '#3B82F6', '#6366F1', '#A855F7']

type PaletteOption = {
  hex: string
  group: string
}

const PALETTE_OPTIONS: PaletteOption[] = [
  { hex: '#1E1E1E', group: 'Neutros' },
  { hex: '#E0E0E0', group: 'Neutros' },

  { hex: '#C00000', group: 'Rojos' },
  { hex: '#EF9A9A', group: 'Rojos' },

  { hex: '#E65100', group: 'Naranjas' },
  { hex: '#FFCC80', group: 'Naranjas' },

  { hex: '#2E7D32', group: 'Verdes' },
  { hex: '#A5D6A7', group: 'Verdes' },

  { hex: '#0D47A1', group: 'Azules' },
  { hex: '#90CAF9', group: 'Azules' },

  { hex: '#5B4788', group: 'Morados' },
  { hex: '#B493C4', group: 'Morados' },
]

const EXTREME_PALETTE_HEX = [
  '#1E1E1E', '#E0E0E0', '#C00000', '#EF9A9A', '#E65100', '#FFCC80',
  '#2E7D32', '#A5D6A7', '#0D47A1', '#90CAF9', '#5B4788', '#B493C4',
  '#F472B6', '#F87171', '#34D399', '#FBBF24', '#60A5FA', '#A3E635',
]

const EXTREME_PALETTE_OPTIONS: PaletteOption[] = EXTREME_PALETTE_HEX.map((hex, index) => ({
  hex,
  group: index < 9 ? 'Oscuros' : 'Claros',
}))

const CONFETTI_COLORS = [
  '#F472B6', '#F87171', '#34D399', '#FBBF24', '#60A5FA', '#A3E635', '#F43F5E', '#F59E42', '#10B981',
]

const SOUND_SOURCES = {
  tap: tapSoundSrc,
  select: selectSoundSrc,
  paint: paintSoundSrc,
  correct: correctSoundSrc,
  flip: flipSoundSrc,
  complete: completeSoundSrc,
} as const

const INFINITE_START_COLORS = 3
const INFINITE_PANEL_SECONDS = 5 * 60

const INFINITE_COLOR_POOL = [...new Set([...PALETTE_OPTIONS, ...EXTREME_PALETTE_OPTIONS].map((entry) => entry.hex))]
const DEFAULT_INFINITE_PALETTE = INFINITE_COLOR_POOL.slice(0, INFINITE_START_COLORS)

type SoundName = keyof typeof SOUND_SOURCES

const formatSeconds = (value: number): string => {
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const hashDate = (value: string): number => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const createRng = (seed: number): (() => number) => {
  let t = seed + 0x6d2b79f5
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pickFrom = <T,>(items: T[], rng: () => number): T => {
  const index = Math.floor(rng() * items.length)
  return items[Math.max(0, Math.min(items.length - 1, index))]
}

const pickUniqueRandomColors = (pool: string[], count: number, exclude: string[] = []): string[] => {
  const excludedSet = new Set(exclude.map((color) => color.toLowerCase()))
  const available = pool.filter((color) => !excludedSet.has(color.toLowerCase()))
  const shuffled = [...available]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled.slice(0, Math.max(0, Math.min(count, shuffled.length)))
}

const mixColors = (a: string, b: string): string => {
  const rgbA = hexToRgb(a)
  const rgbB = hexToRgb(b)
  return rgbToHex({
    r: Math.round((rgbA.r + rgbB.r) / 2),
    g: Math.round((rgbA.g + rgbB.g) / 2),
    b: Math.round((rgbA.b + rgbB.b) / 2),
  })
}

const cellKey = (row: number, col: number): string => `${row}-${col}`

const placeClue = (
  row: number,
  col: number,
  clues: Map<string, string>,
  rowCounts: number[],
  colCounts: number[],
): boolean => {
  const key = cellKey(row, col)
  if (clues.has(key)) {
    return false
  }
  if (rowCounts[row] >= 2 || colCounts[col] >= 2) {
    return false
  }

  clues.set(key, '')
  rowCounts[row] += 1
  colCounts[col] += 1
  return true
}

const buildDailyPuzzle = (dateKey: string, paletteHex: string[]): FusionPuzzle => {
  const size = 5
  const rng = createRng(hashDate(`fusion-${dateKey}`))

  const solvedRows = Array.from({ length: size }, () => pickFrom(paletteHex, rng))
  const solvedCols = Array.from({ length: size }, () => pickFrom(paletteHex, rng))

  const clues = new Map<string, string>()

  const rowCounts = Array.from({ length: size }, () => 0)
  const colCounts = Array.from({ length: size }, () => 0)

  // Ensure every row has at least one clue.
  for (let row = 0; row < size; row += 1) {
    const colOrder = Array.from({ length: size }, (_, i) => i).sort(() => rng() - 0.5)
    const availableCols = colOrder.filter((col) => colCounts[col] < 2)
    const targetCol = availableCols.length > 0
      ? availableCols.reduce((best, col) => (colCounts[col] < colCounts[best] ? col : best), availableCols[0])
      : colOrder[0]
    placeClue(row, targetCol, clues, rowCounts, colCounts)
  }

  // Ensure every column has at least one clue.
  for (let col = 0; col < size; col += 1) {
    if (colCounts[col] > 0) {
      continue
    }

    const rowOrder = Array.from({ length: size }, (_, i) => i).sort(() => rng() - 0.5)
    const candidateRows = rowOrder.filter((row) => rowCounts[row] < 2)
    if (candidateRows.length === 0) {
      continue
    }

    const targetRow = candidateRows.reduce((best, row) => (rowCounts[row] < rowCounts[best] ? row : best), candidateRows[0])
    placeClue(targetRow, col, clues, rowCounts, colCounts)
  }

  // Add a few extra clues while respecting max 2 clues per row/column.
  const targetClues = 8
  const allCells = Array.from({ length: size * size }, (_, idx) => ({
    row: Math.floor(idx / size),
    col: idx % size,
  })).sort(() => rng() - 0.5)

  for (const cell of allCells) {
    if (clues.size >= targetClues) {
      break
    }
    placeClue(cell.row, cell.col, clues, rowCounts, colCounts)
  }

  for (const key of clues.keys()) {
    const [rowStr, colStr] = key.split('-')
    const row = Number(rowStr)
    const col = Number(colStr)
    clues.set(key, mixColors(solvedRows[row], solvedCols[col]))
  }

  return {
    size,
    clues,
    solvedRows,
    solvedCols,
  }
}


export function ColorFusionTab({ dateKey, session, showGame, selectedMode, onBackToHome, onStartInfinite }: ColorFusionTabProps) {
  const [activeTab, setActiveTab] = useState<CrucigamaTabView>('game')
  const [introTab, setIntroTab] = useState<CrucigamaIntroTab>('daily')
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>('normal')
  // Estado para toggle de cuadrícula
  const [showObjective, setShowObjective] = useState(false)
  const challengeMode = selectedMode
  const isInfiniteMode = challengeMode === 'infinite'
  const [infiniteFloor, setInfiniteFloor] = useState(1)
  const [infiniteFloorsCompleted, setInfiniteFloorsCompleted] = useState(0)
  const [infinitePalette, setInfinitePalette] = useState<string[]>([])
  const [infiniteChoice, setInfiniteChoice] = useState<string[]>([])
  const [infiniteChoiceSelected, setInfiniteChoiceSelected] = useState<string | null>(null)
  const [showInfiniteChoiceModal, setShowInfiniteChoiceModal] = useState(false)
  const [showInfiniteCompletionOverlay, setShowInfiniteCompletionOverlay] = useState(false)
  const [isInfiniteCompletionOverlayFading, setIsInfiniteCompletionOverlayFading] = useState(false)
  const [infinitePhase, setInfinitePhase] = useState<'playing' | 'choice' | 'failed'>('playing')
  const activePaletteOptions = useMemo(
    () => {
      if (isInfiniteMode) {
        const palette = infinitePalette.length > 0 ? infinitePalette : DEFAULT_INFINITE_PALETTE
        return palette.map((hex) => ({ hex, group: 'Infinito' }))
      }
      return PALETTE_OPTIONS
    },
    [infinitePalette, isInfiniteMode],

  )
  const puzzlePaletteHex = useMemo(
    () => activePaletteOptions.map((entry) => entry.hex),
    [activePaletteOptions],
  )
  const puzzleSeed = useMemo(() => {
    if (!isInfiniteMode) {
      return `${dateKey}-${challengeMode}`
    }

    return `infinite:${session.user.id}:${infiniteFloor}:${infinitePalette.join(',')}`
  }, [challengeMode, dateKey, infiniteFloor, infinitePalette, isInfiniteMode, session.user.id])
  const puzzle = useMemo(() => buildDailyPuzzle(puzzleSeed, puzzlePaletteHex), [puzzlePaletteHex, puzzleSeed])
  const [rowColors, setRowColors] = useState<Array<string | null>>(Array.from({ length: puzzle.size }, () => null))
  const [colColors, setColColors] = useState<Array<string | null>>(Array.from({ length: puzzle.size }, () => null))
  // Animación de relleno
  const [animating, setAnimating] = useState<{ type: 'row' | 'col'; index: number; color: string } | null>(null)
  const [animationStep, setAnimationStep] = useState(0)
  const pendingColorRef = useRef<{ type: 'row' | 'col'; index: number; color: string } | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null)
  // No validaciones, todo es reactivo
  const [isComplete, setIsComplete] = useState(false)
  const [recentlyCorrectKeys, setRecentlyCorrectKeys] = useState<string[]>([])
  const confettiRef = useRef<HTMLDivElement>(null)
  const miniObjectiveRef = useRef<HTMLDivElement>(null)
  const boardFrameRef = useRef<HTMLDivElement>(null)
  const [overlayRects, setOverlayRects] = useState<{ mini: DOMRect; board: DOMRect } | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [lastCompletedSeconds, setLastCompletedSeconds] = useState<number | null>(null)
  const [leaderboardAttempts, setLeaderboardAttempts] = useState<CrucigamaAttempt[]>([])
  const [infiniteLeaderboardAttempts, setInfiniteLeaderboardAttempts] = useState<CrucigamaInfiniteEntry[]>([])
  const [hasCompletedTodayNormal, setHasCompletedTodayNormal] = useState(false)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [infiniteLeaderboardLoading, setInfiniteLeaderboardLoading] = useState(false)
  const [infiniteLeaderboardError, setInfiniteLeaderboardError] = useState<string | null>(null)
  const soundPlayersRef = useRef<Partial<Record<SoundName, HTMLAudioElement>>>({})
  const previousCorrectRef = useRef<Set<string>>(new Set())
  const previousCompleteRef = useRef(false)
  const startedAtRef = useRef<number | null>(null)
  const completionHandledRef = useRef(false)
  const infiniteFadeTimeoutRef = useRef<number | null>(null)
  const infiniteChoiceTimeoutRef = useRef<number | null>(null)

  const refreshCrucigamaLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true)
    setLeaderboardError(null)

    try {
      const [{ data: ownData, error: ownError }, { data: allData, error: allError }] = await Promise.all([
        supabase
          .from('crucigama_attempts')
          .select('mode')
          .eq('user_id', session.user.id)
          .eq('date', dateKey),
        supabase
          .from('crucigama_attempts')
          .select('user_id,date,mode,seconds,created_at')
          .eq('date', dateKey),
      ])

      if (ownError || allError) {
        const message = (ownError || allError)?.message?.toLowerCase() ?? ''
        if (message.includes('crucigama_attempts')) {
          setLeaderboardError('Falta aplicar la tabla de CruciGama en Supabase.')
        } else {
          setLeaderboardError((ownError || allError)?.message ?? 'No se pudo cargar la tabla de CruciGama.')
        }
        setLeaderboardAttempts([])
        setHasCompletedTodayNormal(false)
        return
      }

      const ownModes = new Set((ownData ?? []).map((entry) => entry.mode))
      setHasCompletedTodayNormal(ownModes.has('normal'))

      const allAttempts = (allData ?? []).filter(
        (attempt) => Number.isFinite(attempt.seconds) && attempt.seconds > 0 && attempt.mode === 'normal',
      )

      const userIds = [...new Set(allAttempts.map((attempt) => attempt.user_id))]
      let usernameById: Record<string, string> = {}
      let avatarUrlById: Record<string, string | undefined> = {}

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id,username,avatar_url')
          .in('id', userIds)

        usernameById = (profilesData ?? []).reduce<Record<string, string>>((acc, profile) => {
          acc[profile.id] = profile.username
          return acc
        }, {})
        avatarUrlById = (profilesData ?? []).reduce<Record<string, string | undefined>>((acc, profile) => {
          acc[profile.id] = profile.avatar_url ?? undefined
          return acc
        }, {})
      }

      const formatAttempt = (attempt: { user_id: string; date: string; mode: string; seconds: number; created_at: string }) => ({
        userId: attempt.user_id,
        username: usernameById[attempt.user_id] ?? `player-${attempt.user_id.slice(0, 6)}`,
        avatarUrl: avatarUrlById[attempt.user_id],
        dateKey: attempt.date,
        mode: attempt.mode as CrucigamaMode,
        seconds: attempt.seconds,
        completedAt: attempt.created_at,
      })

      const normal = allAttempts
        .filter((attempt) => attempt.mode === 'normal')
        .map(formatAttempt)
        .sort((a, b) => a.seconds - b.seconds)

      setLeaderboardAttempts(normal)
    } finally {
      setLeaderboardLoading(false)
    }
  }, [dateKey, session.user.id])

  const refreshCrucigamaInfiniteLeaderboard = useCallback(async () => {
    setInfiniteLeaderboardLoading(true)
    setInfiniteLeaderboardError(null)

    try {
      const { data, error } = await supabase
        .from('crucigama_infinite_attempts')
        .select('user_id,floors')

      if (error) {
        const message = error.message?.toLowerCase() ?? ''
        if (message.includes('crucigama_infinite_attempts')) {
          setInfiniteLeaderboardError('Falta crear la tabla crucigama_infinite_attempts en Supabase.')
        } else {
          setInfiniteLeaderboardError(error.message ?? 'No se pudo cargar el leaderboard infinito de CruciGama.')
        }
        setInfiniteLeaderboardAttempts([])
        return
      }

      const attempts = data ?? []
      const userIds = [...new Set(attempts.map((attempt) => attempt.user_id))]

      let usernameById: Record<string, string> = {}
      let avatarUrlById: Record<string, string | undefined> = {}

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id,username,avatar_url')
          .in('id', userIds)

        usernameById = (profilesData ?? []).reduce<Record<string, string>>((acc, profile) => {
          acc[profile.id] = profile.username
          return acc
        }, {})
        avatarUrlById = (profilesData ?? []).reduce<Record<string, string | undefined>>((acc, profile) => {
          acc[profile.id] = profile.avatar_url ?? undefined
          return acc
        }, {})
      }

      const rows = userIds.map((userId) => {
        const userAttempts = attempts.filter((attempt) => attempt.user_id === userId)
        const bestFloors = userAttempts.reduce((best, attempt) => Math.max(best, Number(attempt.floors ?? 0)), 0)

        return {
          userId,
          username: usernameById[userId] ?? `player-${userId.slice(0, 6)}`,
          avatarUrl: avatarUrlById[userId],
          bestFloors,
          runsPlayed: userAttempts.length,
        }
      })

      rows.sort((a, b) => b.bestFloors - a.bestFloors)
      setInfiniteLeaderboardAttempts(rows)
    } finally {
      setInfiniteLeaderboardLoading(false)
    }
  }, [])

  const saveCrucigamaInfiniteRun = useCallback(async (floorsCompleted: number) => {
    const { error } = await supabase
      .from('crucigama_infinite_attempts')
      .insert({
        user_id: session.user.id,
        floors: floorsCompleted,
      })

    if (error) {
      const message = error.message?.toLowerCase() ?? ''
      if (message.includes('crucigama_infinite_attempts')) {
        setInfiniteLeaderboardError('Falta crear la tabla crucigama_infinite_attempts en Supabase para guardar el modo infinito.')
      } else {
        setInfiniteLeaderboardError(error.message ?? 'No se pudo guardar la racha infinita de CruciGama.')
      }
      return
    }

    await refreshCrucigamaInfiniteLeaderboard()
  }, [refreshCrucigamaInfiniteLeaderboard, session.user.id])

  const playSound = useCallback((name: SoundName, volume = 0.14) => {
    const player = soundPlayersRef.current[name]
    if (!player) {
      return
    }
    const instance = new Audio(player.src)
    instance.volume = volume
    instance.play().catch(() => {})
  }, [])

  const applyColor = useCallback((color: string) => {
    if (isInfiniteMode && infinitePhase !== 'playing') {
      return
    }
    if (!selectedTarget) return
    playSound('paint', 0.12)
    setAnimating({ type: selectedTarget.type, index: selectedTarget.index, color })
    setAnimationStep(0)
    pendingColorRef.current = { type: selectedTarget.type, index: selectedTarget.index, color }
  }, [infinitePhase, isInfiniteMode, selectedTarget, playSound])

  const resetBoardForCurrentPuzzle = useCallback(() => {
    setRowColors(Array.from({ length: puzzle.size }, () => null))
    setColColors(Array.from({ length: puzzle.size }, () => null))
    setSelectedTarget(null)
    setAnimating(null)
    setAnimationStep(0)
    pendingColorRef.current = null
    setIsComplete(false)
    setRecentlyCorrectKeys([])
    previousCorrectRef.current = new Set()
    previousCompleteRef.current = false
    completionHandledRef.current = false
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
  }, [puzzle.size])

  const continueInfiniteRunWithColor = useCallback((nextColor: string) => {
    setInfinitePalette((previous) => {
      if (previous.some((color) => color.toLowerCase() === nextColor.toLowerCase())) {
        return previous
      }
      return [...previous, nextColor]
    })
    setInfiniteFloor((previous) => previous + 1)
    setInfinitePhase('playing')
    setInfiniteChoice([])
    setInfiniteChoiceSelected(null)
    setShowInfiniteChoiceModal(false)
    setShowInfiniteCompletionOverlay(false)
    setIsInfiniteCompletionOverlayFading(false)
    if (infiniteFadeTimeoutRef.current !== null) {
      window.clearTimeout(infiniteFadeTimeoutRef.current)
      infiniteFadeTimeoutRef.current = null
    }
    if (infiniteChoiceTimeoutRef.current !== null) {
      window.clearTimeout(infiniteChoiceTimeoutRef.current)
      infiniteChoiceTimeoutRef.current = null
    }
    resetBoardForCurrentPuzzle()
  }, [resetBoardForCurrentPuzzle])

  useEffect(() => {
    const players: Partial<Record<SoundName, HTMLAudioElement>> = {}
    ;(Object.keys(SOUND_SOURCES) as SoundName[]).forEach((name) => {
      const audio = new Audio(SOUND_SOURCES[name])
      audio.preload = 'auto'
      players[name] = audio
    })
    soundPlayersRef.current = players
  }, [])

  useEffect(() => {
    if (!showGame) {
      const timeoutId = window.setTimeout(() => {
        setActiveTab('game')
          setIntroTab('daily')
        setLeaderboardMode('normal')
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    const timeoutId = window.setTimeout(() => {
      setActiveTab('game')
      setLeaderboardMode(selectedMode)
    }, 0)

    const refreshTimeoutId = window.setTimeout(() => {
      if (selectedMode === 'infinite') {
        void refreshCrucigamaInfiniteLeaderboard()
      } else {
        void refreshCrucigamaLeaderboard()
      }
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      window.clearTimeout(refreshTimeoutId)
    }
  }, [showGame, selectedMode, refreshCrucigamaInfiniteLeaderboard, refreshCrucigamaLeaderboard])

  useEffect(() => {
    if (!showGame || !isInfiniteMode) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const initialPalette = pickUniqueRandomColors(INFINITE_COLOR_POOL, INFINITE_START_COLORS)
      setInfinitePalette(initialPalette)
      setInfiniteFloor(1)
      setInfiniteFloorsCompleted(0)
      setInfiniteChoice([])
      setInfiniteChoiceSelected(null)
      setInfinitePhase('playing')
      setShowInfiniteChoiceModal(false)
      setShowInfiniteCompletionOverlay(false)
      setIsInfiniteCompletionOverlayFading(false)
      if (infiniteFadeTimeoutRef.current !== null) {
        window.clearTimeout(infiniteFadeTimeoutRef.current)
        infiniteFadeTimeoutRef.current = null
      }
      if (infiniteChoiceTimeoutRef.current !== null) {
        window.clearTimeout(infiniteChoiceTimeoutRef.current)
        infiniteChoiceTimeoutRef.current = null
      }
      setLastCompletedSeconds(null)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [isInfiniteMode, showGame])

  useEffect(() => {
    if (!showGame) {
      return
    }

    if (isInfiniteMode) {
      setShowObjective(true)
      return
    }

    setShowObjective(false)
  }, [isInfiniteMode, showGame])

  useEffect(() => {
    if (!showGame) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      resetBoardForCurrentPuzzle()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [showGame, puzzleSeed, resetBoardForCurrentPuzzle])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshCrucigamaLeaderboard()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [refreshCrucigamaLeaderboard])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshCrucigamaInfiniteLeaderboard()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [refreshCrucigamaInfiniteLeaderboard])

  useEffect(() => {
    if (!showGame) {
      return
    }

    if (isInfiniteMode) {
      return
    }

    const blocked = hasCompletedTodayNormal
    if (blocked) {
      const timeoutId = window.setTimeout(() => {
        setLeaderboardMode(challengeMode)
        setActiveTab('leaderboard')
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [showGame, challengeMode, hasCompletedTodayNormal, isInfiniteMode])

  useEffect(() => {
    if (!showGame) {
      startedAtRef.current = null
      const timeoutId = window.setTimeout(() => {
        setElapsedSeconds(0)
      }, 0)
      completionHandledRef.current = false
      return () => window.clearTimeout(timeoutId)
    }

    if (activeTab !== 'game' || isComplete) {
      return
    }

    if (isInfiniteMode && infinitePhase !== 'playing') {
      return
    }

    if (!startedAtRef.current) {
      startedAtRef.current = Date.now()
    }

    const update = () => {
      if (!startedAtRef.current) {
        return
      }
      setElapsedSeconds((Date.now() - startedAtRef.current) / 1000)
    }

    update()
    const intervalId = window.setInterval(update, 250)
    return () => window.clearInterval(intervalId)
  }, [showGame, activeTab, infinitePhase, isComplete, isInfiniteMode])

  useEffect(() => {
    if (!showGame || activeTab !== 'game' || !isInfiniteMode || infinitePhase !== 'playing' || isComplete) {
      return
    }

    if (elapsedSeconds < INFINITE_PANEL_SECONDS) {
      return
    }

    setInfinitePhase('failed')
    setShowInfiniteChoiceModal(false)
    setShowInfiniteCompletionOverlay(false)
    setIsInfiniteCompletionOverlayFading(false)
    if (infiniteFadeTimeoutRef.current !== null) {
      window.clearTimeout(infiniteFadeTimeoutRef.current)
      infiniteFadeTimeoutRef.current = null
    }
    if (infiniteChoiceTimeoutRef.current !== null) {
      window.clearTimeout(infiniteChoiceTimeoutRef.current)
      infiniteChoiceTimeoutRef.current = null
    }
    void saveCrucigamaInfiniteRun(infiniteFloorsCompleted)
  }, [
    activeTab,
    elapsedSeconds,
    infiniteFloorsCompleted,
    infinitePhase,
    isComplete,
    isInfiniteMode,
    saveCrucigamaInfiniteRun,
    showGame,
  ])

  useEffect(() => {
    if (!isComplete || completionHandledRef.current) {
      return
    }

    completionHandledRef.current = true
    const endMs = Date.now()
    const startMs = startedAtRef.current
    const measuredSeconds = startMs ? (endMs - startMs) / 1000 : elapsedSeconds
    const runSeconds = Math.max(1, measuredSeconds)
    setElapsedSeconds(runSeconds)
    setLastCompletedSeconds(runSeconds)

    if (isInfiniteMode) {
      const nextFloorsCompleted = infiniteFloor
      setInfiniteFloorsCompleted(nextFloorsCompleted)

      const uniqueCandidates = pickUniqueRandomColors(INFINITE_COLOR_POOL, 2, infinitePalette)
      const candidates = uniqueCandidates.length === 2
        ? uniqueCandidates
        : pickUniqueRandomColors(INFINITE_COLOR_POOL, 2)
      setInfiniteChoice(candidates)
      setInfiniteChoiceSelected(null)
      setInfinitePhase('choice')

      setShowInfiniteCompletionOverlay(true)
      setIsInfiniteCompletionOverlayFading(false)

      if (infiniteFadeTimeoutRef.current !== null) {
        window.clearTimeout(infiniteFadeTimeoutRef.current)
      }
      if (infiniteChoiceTimeoutRef.current !== null) {
        window.clearTimeout(infiniteChoiceTimeoutRef.current)
      }

      infiniteFadeTimeoutRef.current = window.setTimeout(() => {
        setIsInfiniteCompletionOverlayFading(true)
      }, 850)

      infiniteChoiceTimeoutRef.current = window.setTimeout(() => {
        setShowInfiniteCompletionOverlay(false)
        setShowInfiniteChoiceModal(true)
      }, 1450)
    }

    const saveAttempt = async () => {
      const { data: existingRow, error: readError } = await supabase
        .from('crucigama_attempts')
        .select('id,seconds')
        .eq('user_id', session.user.id)
        .eq('date', dateKey)
        .eq('mode', challengeMode)
        .maybeSingle()

      if (readError) {
        setLeaderboardError(readError.message)
        return
      }

      if (!existingRow) {
        const { error: insertError } = await supabase
          .from('crucigama_attempts')
          .insert({
            user_id: session.user.id,
            date: dateKey,
            mode: challengeMode,
            seconds: runSeconds,
          })

        if (insertError) {
          setLeaderboardError(insertError.message)
          return
        }
      } else if (runSeconds < existingRow.seconds) {
        const { error: updateError } = await supabase
          .from('crucigama_attempts')
          .update({ seconds: runSeconds })
          .eq('id', existingRow.id)

        if (updateError) {
          setLeaderboardError(updateError.message)
          return
        }
      }

      await refreshCrucigamaLeaderboard()
    }

    void saveAttempt()

    const timeoutId = window.setTimeout(() => {
      setIntroTab('daily')
      onBackToHome()
    }, 1300)

    return () => window.clearTimeout(timeoutId)
  }, [
    challengeMode,
    dateKey,
    elapsedSeconds,
    infiniteFloor,
    infinitePalette,
    isComplete,
    isInfiniteMode,
    onBackToHome,
    refreshCrucigamaLeaderboard,
    session.user.id,
  ])

  useEffect(() => {
    return () => {
      if (infiniteFadeTimeoutRef.current !== null) {
        window.clearTimeout(infiniteFadeTimeoutRef.current)
      }
      if (infiniteChoiceTimeoutRef.current !== null) {
        window.clearTimeout(infiniteChoiceTimeoutRef.current)
      }
    }
  }, [])

  // Animación smooth de relleno
  useEffect(() => {
    if (!animating) return
    const size = puzzle.size
    if (animationStep >= size) {
      // Al terminar, aplica el color a toda la fila/columna fuera del render
      setTimeout(() => {
        const pending = pendingColorRef.current
        if (!pending) return
        if (pending.type === 'row') {
          setRowColors((prev) => prev.map((c, i) => i === pending.index ? pending.color : c))
        } else {
          setColColors((prev) => prev.map((c, i) => i === pending.index ? pending.color : c))
        }
        setAnimating(null)
        setAnimationStep(0)
        pendingColorRef.current = null
      }, 0)
      return
    }
    const timeout = setTimeout(() => {
      setAnimationStep((step) => step + 1)
    }, 45)
    return () => clearTimeout(timeout)
  }, [animating, animationStep, puzzle.size])

  const openPalette = (target: Target) => {
    if (isInfiniteMode && infinitePhase !== 'playing') {
      return
    }
    playSound('select', 0.1)
    setSelectedTarget(target)
    playSound('tap', 0.08)
  }

  // No runValidation, todo es reactivo

  const getObjectiveCellColor = (row: number, col: number): string => {
    const key = cellKey(row, col)
    const clueColor = puzzle.clues.get(key)
    if (clueColor) {
      return clueColor
    }

    return '#FFFFFF'
  }

  const getPlayCellColor = useCallback((row: number, col: number): string => {
    // Si está animando, mostrar el color progresivamente
    if (animating) {
      if (animating.type === 'row' && row === animating.index && col < animationStep) {
        // Animando fila
        const colColor = colColors[col]
        if (!colColor) return animating.color // Mostrar color puro si la otra dimensión es null
        return mixColors(animating.color, colColor)
      }
      if (animating.type === 'col' && col === animating.index && row < animationStep) {
        // Animando columna
        const rowColor = rowColors[row]
        if (!rowColor) return animating.color // Mostrar color puro si la otra dimensión es null
        return mixColors(rowColor, animating.color)
      }
    }
    // Normal
    const rowColor = rowColors[row]
    const colColor = colColors[col]
    if (rowColor && colColor) {
      return mixColors(rowColor, colColor)
    }
    if (rowColor) return rowColor
    if (colColor) return colColor
    return '#E5E7EB'
  }, [animating, animationStep, rowColors, colColors])

  // Chequeo de completado
  useEffect(() => {
    let allOk = true
    const nowCorrectKeys = new Set<string>()
    for (let row = 0; row < puzzle.size; row++) {
      for (let col = 0; col < puzzle.size; col++) {
        const key = `${row}-${col}`
        if (puzzle.clues.has(key)) {
          // Solo comparar donde hay pista
          const expected = puzzle.clues.get(key)
          const actual = getPlayCellColor(row, col)
          if (expected?.toLowerCase() !== actual?.toLowerCase()) {
            allOk = false
          } else {
            nowCorrectKeys.add(key)
          }
        }
      }
    }

    const newlyCorrect = [...nowCorrectKeys].filter((key) => !previousCorrectRef.current.has(key))
    if (newlyCorrect.length > 0) {
      setRecentlyCorrectKeys(newlyCorrect)
      playSound('correct', 0.13)
      setTimeout(() => setRecentlyCorrectKeys([]), 420)
    }
    previousCorrectRef.current = nowCorrectKeys

    if (allOk && !previousCompleteRef.current) {
      playSound('complete', 0.16)
    }
    previousCompleteRef.current = allOk

    // Usar setTimeout para evitar cascada de renders
    setTimeout(() => setIsComplete(allOk), 0)
  }, [rowColors, colColors, puzzle, getPlayCellColor, playSound])

  useLayoutEffect(() => {
    const updateRects = () => {
      const mini = miniObjectiveRef.current?.getBoundingClientRect()
      const board = boardFrameRef.current?.getBoundingClientRect()
      if (!mini || !board) {
        return
      }
      setOverlayRects({ mini, board })
    }

    updateRects()
    window.addEventListener('resize', updateRects)
    window.addEventListener('scroll', updateRects, true)
    return () => {
      window.removeEventListener('resize', updateRects)
      window.removeEventListener('scroll', updateRects, true)
    }
  }, [showObjective, puzzle.size])

  const renderCrucigamaRows = (attempts: CrucigamaAttempt[]) => {
    if (leaderboardLoading) {
      return (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-500">
          Cargando leaderboard de hoy...
        </p>
      )
    }

    if (leaderboardError) {
      return (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {leaderboardError}
        </p>
      )
    }

    if (attempts.length === 0) {
      return null
    }

    return (
      <div className="space-y-2">
        {attempts.slice(0, 10).map((attempt, index) => (
          <article
            key={`crucigama-attempt-row-${attempt.mode}-${attempt.userId}`}
            className="grid grid-cols-[40px_36px_1fr_auto] items-center gap-2 rounded-xl bg-zinc-900 px-3 py-3 text-zinc-100 sm:grid-cols-[40px_40px_1fr_auto] sm:gap-3"
          >
            <span className="text-center font-bold text-amber-300">#{index + 1}</span>

            {attempt.avatarUrl ? (
              <img
                src={attempt.avatarUrl}
                alt={`Avatar de ${attempt.username}`}
                className="h-9 w-9 rounded-full border border-zinc-600 object-cover sm:h-10 sm:w-10"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-[10px] font-black uppercase text-zinc-300 sm:h-10 sm:w-10 sm:text-xs">
                {attempt.username.slice(0, 2)}
              </div>
            )}

            <p className="truncate text-sm font-black sm:text-base">{attempt.username}</p>
            <p className="text-sm font-extrabold text-emerald-300 sm:text-base">{formatSeconds(attempt.seconds)}</p>
          </article>
        ))}
      </div>
    )
  }

  const renderInfiniteChampion = () => {
    if (infiniteLeaderboardLoading) {
      return (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-500">
          Cargando campeon de la torre infinita...
        </p>
      )
    }

    if (infiniteLeaderboardError) {
      return (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {infiniteLeaderboardError}
        </p>
      )
    }

    const champion = infiniteLeaderboardAttempts[0]
    if (!champion) {
      return (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-500">
          Aun no hay campeon de la torre infinita.
        </p>
      )
    }

    return (
      <article className="grid grid-cols-[44px_40px_1fr_auto] items-center gap-3 rounded-xl bg-zinc-900 px-3 py-3 text-zinc-100">
        <span className="text-center text-lg font-black text-amber-300">#1</span>

        {champion.avatarUrl ? (
          <img
            src={champion.avatarUrl}
            alt={`Avatar de ${champion.username}`}
            className="h-10 w-10 rounded-full border border-zinc-600 object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-[10px] font-black uppercase text-zinc-300">
            {champion.username.slice(0, 2)}
          </div>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-black sm:text-base">Campeon de la torre infinita</p>
          <p className="truncate text-xs text-zinc-300">{champion.username}</p>
        </div>

        <p className="whitespace-nowrap text-sm font-extrabold text-emerald-300 sm:text-base">
          {champion.bestFloors} piso{champion.bestFloors !== 1 ? 's' : ''}
        </p>
      </article>
    )
  }

  return (
    <section className="relative overflow-visible rounded-[2rem] border border-[#f6f6f5] bg-gradient-to-br from-[#f7f3ea] via-[#f2ecdf] to-[#ede5d7] p-4 shadow-[0_20px_40px_rgba(92,75,49,0.14)] sm:p-6">
      {!showGame && (
        <div className="mb-4 flex justify-center">
          <div className="inline-flex rounded-xl border border-[#d5c6ab] bg-[#f8f1e5] p-1">
            <button
              type="button"
              onClick={() => setIntroTab('daily')}
              className={`rounded-lg px-3 py-1 text-xs font-black transition ${introTab === 'daily' ? 'bg-[#5f4227] text-white' : 'text-[#694c31] hover:bg-[#efe3d1]'}`}
            >
              Reto diario
            </button>
            <button
              type="button"
              onClick={() => setIntroTab('infinite')}
              className={`rounded-lg px-3 py-1 text-xs font-black transition ${introTab === 'infinite' ? 'bg-[#5f4227] text-white' : 'text-[#694c31] hover:bg-[#efe3d1]'}`}
            >
              Torre infinita
            </button>
          </div>
        </div>
      )}

      {showGame && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="rounded-lg border border-[#d7c8af] bg-[#fff9ee] px-3 py-1 text-xs font-black text-[#6b4f34]">
            {activeTab === 'leaderboard'
              ? `Tabla ${leaderboardMode === 'infinite' ? 'infinita' : 'diaria'} · ${leaderboardMode === 'infinite' ? 'Torre infinita' : 'Normal'}`
              : `${challengeMode === 'infinite' ? `Torre infinita · Piso ${infiniteFloor}` : 'Reto diario · Normal'}`}
          </p>
          {activeTab === 'game' && (
            <p className="rounded-lg border border-[#d7c8af] bg-[#fff9ee] px-3 py-1 text-xs font-black text-[#6b4f34]">
              {challengeMode === 'infinite'
                ? `Tiempo: ${formatSeconds(Math.max(0, INFINITE_PANEL_SECONDS - elapsedSeconds))} restante`
                : `Tiempo: ${formatSeconds(elapsedSeconds)}`}
            </p>
          )}
        </div>
      )}

      {/* Mensaje de completado con explosión de colores */}
      {showGame && activeTab === 'game' && (isInfiniteMode ? showInfiniteCompletionOverlay : isComplete) && (
        <div
          ref={confettiRef}
          className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none select-none transition-opacity duration-500 ${
            isInfiniteMode && isInfiniteCompletionOverlayFading ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="relative">
            <span className="block text-3xl sm:text-5xl font-extrabold text-white drop-shadow-lg px-8 py-6 rounded-3xl animate-pop bg-gradient-to-br from-pink-400 via-yellow-300 to-green-400 border-4 border-white shadow-2xl">
              ¡Completado!
            </span>
            <div className="absolute inset-0 overflow-visible">
              <ConfettiExplosion />
            </div>
          </div>
        </div>
      )}

      {showGame && activeTab === 'game' && isInfiniteMode && infinitePhase === 'choice' && showInfiniteChoiceModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-3xl border border-[#d7c8af] bg-[#fff9ef] p-5 shadow-[0_24px_40px_rgba(0,0,0,0.25)]">
            <p className="text-base font-black text-[#4f3a24]">Elige tu nuevo color</p>
            <p className="mt-1 text-xs font-semibold text-[#6f5539]">Selecciona 1 color para desbloquear el siguiente piso.</p>

            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {infiniteChoice.map((hex) => {
                const selected = infiniteChoiceSelected?.toLowerCase() === hex.toLowerCase()
                return (
                  <button
                    key={`infinite-choice-${hex}`}
                    type="button"
                    onClick={() => setInfiniteChoiceSelected(hex)}
                    className={`h-16 w-16 rounded-2xl border border-[#8d6b46] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.1),0_8px_12px_rgba(72,54,29,0.35)] transition ${selected ? 'ring-4 ring-emerald-500' : 'hover:-translate-y-0.5 hover:scale-105'}`}
                    style={{ backgroundColor: hex }}
                    title={`Elegir ${hex.toUpperCase()}`}
                  />
                )
              })}
            </div>

            <div className="mt-4 rounded-xl border border-[#dbcdb6] bg-[#f7efdf] px-3 py-2 text-xs font-semibold text-[#6f5539]">
              Pisos completados: {infiniteFloorsCompleted}
            </div>

            <button
              type="button"
              disabled={!infiniteChoiceSelected}
              onClick={() => {
                if (!infiniteChoiceSelected) {
                  return
                }
                continueInfiniteRunWithColor(infiniteChoiceSelected)
              }}
              className="mt-4 w-full rounded-xl bg-[#5f4227] px-4 py-3 text-sm font-black text-white transition hover:bg-[#6b4b2d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente piso
            </button>
          </div>
        </div>
      )}

      {showGame && activeTab === 'game' && isInfiniteMode && infinitePhase === 'failed' && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-black text-red-700">Tiempo agotado. Fin de la torre infinita.</p>
          <p className="mt-1 text-xs font-semibold text-red-700">Pisos completados: {infiniteFloorsCompleted}</p>
          <button
            type="button"
            onClick={() => {
              setLeaderboardMode('infinite')
              setActiveTab('leaderboard')
            }}
            className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100"
          >
            Volver a la clasificacion
          </button>
        </div>
      )}

      {!showGame ? (
        <div className="mx-auto w-full max-w-[760px] space-y-4">
          {introTab === 'daily' ? (
            <div className="rounded-[1.8rem] border border-[#d7c8af] bg-gradient-to-b from-[#f8f2e7] to-[#eee4d4] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_26px_rgba(92,75,49,0.2)] sm:p-6">
              <h3 className="text-lg font-black text-[#4f3a24] sm:text-xl">Clasificacion reto diario</h3>
              <p className="mt-1 text-sm font-semibold text-[#6f5539]">Tabla de hoy de todos los jugadores.</p>
              <div className="mt-4">{renderCrucigamaRows(leaderboardAttempts)}</div>
            </div>
          ) : (
            <div className="rounded-[1.8rem] border border-[#d7c8af] bg-gradient-to-b from-[#f8f2e7] to-[#eee4d4] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_26px_rgba(92,75,49,0.2)] sm:p-6">
              <h3 className="text-lg font-black text-[#4f3a24] sm:text-xl">Campeon de la torre infinita</h3>
              <p className="mt-1 text-sm font-semibold text-[#6f5539]">Lider global por pisos consecutivos completados.</p>
              <div className="mt-4">{renderInfiniteChampion()}</div>
              <button
                type="button"
                onClick={onStartInfinite}
                className="mt-4 w-full rounded-2xl bg-[#5f4227] px-4 py-3 text-sm font-black text-white transition hover:bg-[#6b4b2d]"
              >
                Jugar Torre Infinita
              </button>
            </div>
          )}
        </div>
      ) : activeTab === 'leaderboard' ? (
        <div className="mx-auto w-full max-w-[760px] rounded-[1.8rem] border border-[#d7c8af] bg-gradient-to-b from-[#f8f2e7] to-[#eee4d4] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_26px_rgba(92,75,49,0.2)] sm:p-6">
          <h3 className="text-lg font-black text-[#4f3a24] sm:text-xl">Leaderboard CruciGama · {leaderboardMode === 'infinite' ? 'Torre infinita' : 'Reto normal'}</h3>
          <p className="mt-1 text-sm font-semibold text-[#6f5539]">{leaderboardMode === 'infinite' ? 'Campeon global por pisos consecutivos.' : 'Clasificación diaria compartida de todos los jugadores.'}</p>

          <div className="mt-3 inline-flex rounded-xl border border-[#d5c6ab] bg-[#f8f1e5] p-1">
            <button
              type="button"
              onClick={() => setLeaderboardMode('normal')}
              className={`rounded-lg px-3 py-1 text-xs font-black transition ${leaderboardMode === 'normal' ? 'bg-[#5f4227] text-white' : 'text-[#694c31] hover:bg-[#efe3d1]'}`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setLeaderboardMode('infinite')}
              className={`rounded-lg px-3 py-1 text-xs font-black transition ${leaderboardMode === 'infinite' ? 'bg-[#5f4227] text-white' : 'text-[#694c31] hover:bg-[#efe3d1]'}`}
            >
              Torre infinita
            </button>
          </div>

          {leaderboardMode === 'infinite' ? (
            <div className="mt-4 space-y-2">{renderInfiniteChampion()}</div>
          ) : (
            <>
              <div className="mt-4 rounded-2xl border border-[#dbcdb6] bg-[#fff9ef] p-4">
                <p className="text-xs font-black uppercase tracking-wide text-[#886848]">Tiempo de hoy</p>
                <p className="mt-2 text-3xl font-black text-[#4f3a24]">
                  {lastCompletedSeconds != null
                    ? formatSeconds(lastCompletedSeconds)
                    : (() => {
                        const sourceAttempts = leaderboardAttempts
                        const todayAttempt = sourceAttempts.find((attempt) => attempt.userId === session.user.id)
                        return todayAttempt ? formatSeconds(todayAttempt.seconds) : '--:--'
                      })()}
                </p>
              </div>

              <div className="mt-4 space-y-2">
                {renderCrucigamaRows(leaderboardAttempts)}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-black sm:text-2xl" aria-label="CruciGama">
                <span className="inline-flex items-center gap-[1px]">
                  {CRUCIGAMA_LABEL.split('').map((char, index) => (
                    <span
                      key={`crucigama-title-char-${index}`}
                      style={{ color: CRUCIGAMA_GRADIENT[Math.min(index, CRUCIGAMA_GRADIENT.length - 1)] }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
              </h2>
              <div ref={miniObjectiveRef} className="mt-2 h-[108px] w-[108px]" />
            </div>
            {/* Sin contador de validaciones */}
          </div>

          <div className="cruci-layout relative flex items-start justify-center">
            <div
              className="flex justify-center"
            >
              <div ref={boardFrameRef} className="mx-auto w-max rounded-[2rem] border border-[#d7c9b0] bg-gradient-to-br from-[#f6efdf] to-[#e9ddc8] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_24px_rgba(97,75,39,0.2)]">
                <div
                  className="grid"
                  style={{
                    gap: 'var(--grid-gap)',
                    gridTemplateColumns: `var(--selector-size) repeat(${puzzle.size}, var(--cell-size))`,
                    gridTemplateRows: `var(--selector-size) repeat(${puzzle.size}, var(--cell-size))`,
                  }}
                >
                  <div className="rounded bg-transparent" />
                  {Array.from({ length: puzzle.size }, (_, col) => {
                    const selected = selectedTarget?.type === 'col' && selectedTarget.index === col
                    const colColor = colColors[col]
                    return (
                      <button
                        key={`col-${col}`}
                        type="button"
                        onClick={() => openPalette({ type: 'col', index: col })}
                        className={`selector-chip relative flex items-center justify-center rounded-full border-2 border-[#c9b797] shadow-[inset_0_3px_0_rgba(255,255,255,0.8),inset_0_-3px_0_rgba(0,0,0,0.12),0_10px_14px_rgba(91,72,39,0.32)] transition ${selected ? 'ring-4 ring-emerald-400' : ''}`}
                        style={{
                          backgroundColor: colColor ?? '#efe6d6',
                        }}
                        title={`Columna ${col + 1}`}
                      />
                    )
                  })}
                  {Array.from({ length: puzzle.size }, (_, row) => (
                    <Fragment key={`row-line-${row}`}>
                      <button
                        key={`row-${row}`}
                        type="button"
                        onClick={() => openPalette({ type: 'row', index: row })}
                        className={`selector-chip relative flex items-center justify-center rounded-full border-2 border-[#c9b797] shadow-[inset_0_3px_0_rgba(255,255,255,0.8),inset_0_-3px_0_rgba(0,0,0,0.12),0_10px_14px_rgba(91,72,39,0.32)] transition ${(selectedTarget?.type === 'row' && selectedTarget.index === row) ? 'ring-4 ring-emerald-400' : ''}`}
                        style={{
                          backgroundColor: rowColors[row] ?? '#efe6d6',
                        }}
                        title={`Fila ${row + 1}`}
                      />
                      {Array.from({ length: puzzle.size }, (_, col) => {
                        const key = cellKey(row, col)
                        const expected = puzzle.clues.get(key)
                        const actual = getPlayCellColor(row, col)
                        const isCorrect = !!expected && expected.toLowerCase() === actual.toLowerCase()
                        return (
                          <div
                            key={`play-cell-${row}-${col}`}
                            className={`mix-cell border border-[#71573f] shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-3px_0_rgba(0,0,0,0.14),0_10px_14px_rgba(44,30,12,0.3)] ${isCorrect ? 'ring-2 ring-emerald-500' : ''} ${recentlyCorrectKeys.includes(key) ? 'correct-cell-pop' : ''}`}
                            style={{
                              backgroundColor: actual,
                            }}
                            title="Casilla de mezcla"
                          />
                        )
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {showGame && activeTab === 'game' && overlayRects && (
        <button
          type="button"
          onClick={() => {
            playSound('flip', 0.1)
            setShowObjective((previous) => !previous)
          }}
          className="fixed z-[110] rounded-[2rem] border border-[#d7c9b0] bg-gradient-to-br from-[#f6efdf] to-[#e9ddc8] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_24px_rgba(97,75,39,0.2)] transition-[transform,opacity] duration-500 ease-[cubic-bezier(.77,0,.18,1)]"
          style={{
            left: overlayRects.mini.left,
            top: overlayRects.mini.top,
            width: overlayRects.mini.width,
            height: overlayRects.mini.height,
            transformOrigin: 'top left',
            transform: showObjective
              ? `translate(${overlayRects.board.left - overlayRects.mini.left}px, ${overlayRects.board.top - overlayRects.mini.top}px) scale(${overlayRects.board.width / overlayRects.mini.width}, ${overlayRects.board.height / overlayRects.mini.height})`
              : 'translate(0px, 0px) scale(1)',
            opacity: showObjective ? 1 : 0.95,
          }}
          aria-label={showObjective ? 'Ocultar tabla objetivo' : 'Mostrar tabla objetivo'}
        >
          <div
            className="grid"
            style={{
              gap: '1px',
              gridTemplateColumns: `repeat(${puzzle.size}, 14px)`,
              gridTemplateRows: `repeat(${puzzle.size}, 14px)`,
            }}
          >
            {Array.from({ length: puzzle.size }, (_, row) =>
              Array.from({ length: puzzle.size }, (_, col) => {
                const key = cellKey(row, col)
                const isClue = puzzle.clues.has(key)
                let isCorrect = false
                if (isClue) {
                  const expected = puzzle.clues.get(key)
                  const actual = getPlayCellColor(row, col)
                  if (expected?.toLowerCase() === actual?.toLowerCase()) {
                    isCorrect = true
                  }
                }
                return (
                  <div
                    key={`goal-cell-overlay-${row}-${col}`}
                    className={`rounded-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.38),inset_0_-1px_0_rgba(0,0,0,0.14),0_1px_3px_rgba(44,30,12,0.28)] ${isCorrect ? 'ring-2 ring-emerald-500' : ''} ${recentlyCorrectKeys.includes(key) ? 'correct-cell-pop' : ''}`}
                    style={{
                      backgroundColor: getObjectiveCellColor(row, col),
                    }}
                    title={isClue ? 'Pista fija' : 'Sin pista'}
                  />
                )
              }),
            )}
          </div>
        </button>
      )}
      <style>{`
        .cruci-layout {
          --cell-size: 80px;
          --selector-size: 56px;
          --grid-gap: 12px;
          min-height: calc(var(--selector-size) + (5 * var(--cell-size)) + (5 * var(--grid-gap)) + 44px);
        }
        .selector-chip {
          width: var(--selector-size);
          height: var(--selector-size);
        }
        .mix-cell {
          border-radius: calc(var(--cell-size) * 0.08);
        }
        .example-cell {
          aspect-ratio: 1 / 1;
          width: var(--example-cell-size);
        }
        .correct-cell-pop {
          animation: correct-cell-pop 420ms cubic-bezier(.61,1.6,.7,1);
        }
        @keyframes correct-cell-pop {
          0% { transform: scale(0.92); }
          72% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        
        @media (max-width: 1024px) {
          .cruci-layout {
            --cell-size: 66px;
            --selector-size: 46px;
            --grid-gap: 10px;
          }
        }
        @media (max-width: 768px) {
          .cruci-layout {
            --cell-size: 52px;
            --selector-size: 38px;
            --grid-gap: 8px;
          }
          .palette-swatch {
            width: 44px;
            height: 44px;
            border-radius: 12px;
          }
        }
        @media (max-width: 480px) {
          .cruci-layout {
            --cell-size: 45px;
            --selector-size: 32px;
            --grid-gap: 6px;
          }
          .example-board {
            --example-label-size: 12px;
            --example-cell-size: 16px;
            --example-gap: 2px;
            --example-label-height: 18px;
          }
          .palette-swatch {
            width: 38px;
            height: 38px;
            border-radius: 10px;
          }
        }
        @media (min-width: 481px) {
          .example-board {
            --example-label-size: 22px;
            --example-cell-size: 28px;
            --example-gap: 4px;
            --example-label-height: 24px;
          }
        }
        @media (min-width: 769px) {
          .example-board {
            --example-label-size: 36px;
            --example-cell-size: 44px;
            --example-gap: 8px;
            --example-label-height: 40px;
          }
        }
      `}</style>

      {showGame && activeTab === 'game' && (
        <div
        className="relative z-[100] mx-auto mt-6 w-full max-w-[640px] rounded-[1.75rem] border border-[#d8cab1] bg-gradient-to-br from-[#f5efdf] to-[#eadfc9] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_20px_30px_rgba(86,69,37,0.28)] lg:absolute lg:right-0 lg:top-8 lg:mt-0 lg:w-max lg:max-w-none lg:p-4"
        aria-hidden={false}
      >
        <div className="grid grid-cols-6 gap-2.5 lg:hidden">
          {activePaletteOptions.map((option) => (
            <button
              key={`mobile-${option.group}-${option.hex}`}
              type="button"
              onClick={() => {
                if (!selectedTarget) {
                  return
                }
                applyColor(option.hex)
              }}
              className="palette-swatch h-14 w-14 rounded-2xl border border-[#8d6b46] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.1),0_8px_12px_rgba(72,54,29,0.35)] transition hover:-translate-y-0.5 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: option.hex }}
              title={option.hex.toUpperCase()}
              disabled={!selectedTarget || (isInfiniteMode && infinitePhase !== 'playing')}
            />
          ))}
        </div>

        <div className="hidden space-y-2.5 lg:block">
          {[...new Set(activePaletteOptions.map((option) => option.group))].map((group) => (
            <div key={`palette-row-${group}`} className="flex flex-wrap gap-2.5">
              {activePaletteOptions
                .filter((option) => option.group === group)
                .map((option) => (
                  <button
                    key={`${group}-${option.hex}`}
                    type="button"
                    onClick={() => {
                      if (!selectedTarget) {
                        return
                      }
                      applyColor(option.hex)
                    }}
                    className="palette-swatch h-14 w-14 rounded-2xl border border-[#8d6b46] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.1),0_8px_12px_rgba(72,54,29,0.35)] transition hover:-translate-y-0.5 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: option.hex }}
                    title={option.hex.toUpperCase()}
                    disabled={!selectedTarget || (isInfiniteMode && infinitePhase !== 'playing')}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Sin botón de validar, cuadrícula reactiva */}
    </section>
  )
}

// ConfettiExplosion: simple CSS confetti burst
// ...existing code...

function ConfettiExplosion() {
  // Generar datos estables
  const confettiData = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => {
      // Usar un seed simple para que sea estable
      const seed = i * 12345 + 6789
      const rand = (x: number) => {
        let t = x
        t ^= t << 13
        t ^= t >> 17
        t ^= t << 5
        return Math.abs(t) / 0xffffffff
      }
      const angle = rand(seed) * 360
      const dist = 80 + rand(seed + 1) * 60
      const x = Math.cos(angle) * dist
      const y = Math.sin(angle) * dist
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
      const delay = rand(seed + 2) * 0.2
      return { i, x, y, angle, color, delay }
    })
  }, [])
  return <>
    {confettiData.map(({ i, x, y, angle, color, delay }) => (
      <span
        key={i}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 14,
          height: 14,
          background: color,
          borderRadius: 3,
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${angle}deg)`,
          opacity: 0.85,
          animation: `confetti-pop 0.7s cubic-bezier(.61,1.6,.7,1) ${delay}s both`,
          zIndex: 100,
        }}
      />
    ))}
    <style>{`
      @keyframes confetti-pop {
        0% { opacity: 0; transform: translate(-50%,-50%) scale(0.5); }
        60% { opacity: 1; }
        100% { opacity: 0; transform: translate(-50%,-50%) scale(1.2); }
      }
      .animate-pop {
        animation: pop-scale 0.7s cubic-bezier(.61,1.6,.7,1);
      }
      @keyframes pop-scale {
        0% { transform: scale(0.7); }
        80% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
    `}</style>
  </>
}
