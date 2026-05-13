import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthScreen } from './components/AuthScreen'
import { HsvPicker } from './components/HsvPicker'
import { Leaderboard } from './components/Leaderboard'
import { PodiumPoolTab } from './components/PodiumPoolTab'
import { Records } from './components/Records'
import { TournamentTab } from './components/TournamentTab'
import { UNAUTHORIZED_ACCESS_MESSAGE, verifyAuthorizedUser } from './lib/authGuard'
import { colorErrorPercent, hsvToHex } from './lib/colorMath'
import { dailyTargetColor, todayKey } from './lib/dailyChallenge'
import { difficultyDescription, previewSecondsByDifficulty, scoreAttempt, timeCaps } from './lib/scoring'
import { supabase } from './lib/supabase'
import {
  buildRoundPairings,
  DAILY_LAST_DATE,
  DUELS_PER_MATCH,
  getUserMatchAttempts,
  sumMatchError,
  sumMatchScore,
  TOURNAMENT_START_DATE,
  tournamentTargetColor,
} from './lib/tournament'
import type {
  Difficulty,
  HSV,
  LeaderboardEntry,
  TournamentAttempt,
  TournamentParticipant,
  TournamentPodiumPrediction,
  TournamentRun,
} from './types'

type Stage = 'home' | 'difficulty' | 'preview' | 'pick' | 'result' | 'records' | 'tournamentPreview' | 'tournamentPick'

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
const FIRST_PLAYABLE_DATE = '2026-05-04'
const WARMUP_MAX_USES = 3
const NO_TIMER_USERNAME = 'lara'

type TournamentMatchView = {
  id: string
  roundNumber: number
  matchNumber: number
  winnerUserId: string | null
  player1Id: string
  player2Id: string | null
  player1AttemptsDone: number
  player2AttemptsDone: number
  player1Score: number
  player2Score: number
}

type TournamentRoundView = {
  roundNumber: number
  matches: TournamentMatchView[]
}

const normalizeUsername = (value: string): string => value.trim().toLowerCase()

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

const createDemoTournamentParticipants = (): TournamentParticipant[] => {
  const names = ['Irene', 'Natalia', 'Alejandro', 'Pablo', 'Raul', 'Lucas', 'Sebas', 'Alvaro']
  return names.map((username, index) => ({
    userId: `demo-${String(index + 1).padStart(2, '0')}`,
    username,
    seed: index + 1,
  }))
}

const createDemoTournamentAttempts = (
  runId: string,
  startDate: string,
  participants: TournamentParticipant[],
): TournamentAttempt[] => {
  const bySeed = participants.reduce<Record<number, TournamentParticipant>>((acc, participant) => {
    acc[participant.seed] = participant
    return acc
  }, {})

  const attempts: TournamentAttempt[] = []

  const addSeries = (
    roundNumber: number,
    matchNumber: number,
    seedA: number,
    seedB: number,
    scoresA: [number, number, number],
    scoresB: [number, number, number],
    errorsA: [number, number, number],
    errorsB: [number, number, number],
  ) => {
    const playerA = bySeed[seedA]
    const playerB = bySeed[seedB]
    if (!playerA || !playerB) {
      return
    }

    for (let duelIndex = 1; duelIndex <= DUELS_PER_MATCH; duelIndex += 1) {
      const targetColor = tournamentTargetColor(startDate, roundNumber, duelIndex)

      attempts.push({
        id: `${runId}-r${roundNumber}-m${matchNumber}-a-${duelIndex}`,
        runId,
        userId: playerA.userId,
        roundNumber,
        matchNumber,
        duelIndex,
        targetColor,
        userColor: dailyTargetColor(`${playerA.userId}:${roundNumber}:${matchNumber}:${duelIndex}`),
        error: errorsA[duelIndex - 1],
        time: 10 + duelIndex,
        score: scoresA[duelIndex - 1],
      })

      attempts.push({
        id: `${runId}-r${roundNumber}-m${matchNumber}-b-${duelIndex}`,
        runId,
        userId: playerB.userId,
        roundNumber,
        matchNumber,
        duelIndex,
        targetColor,
        userColor: dailyTargetColor(`${playerB.userId}:${roundNumber}:${matchNumber}:${duelIndex}`),
        error: errorsB[duelIndex - 1],
        time: 10 + duelIndex,
        score: scoresB[duelIndex - 1],
      })
    }
  }

  // Round 1
  addSeries(1, 1, 1, 8, [880, 910, 860], [700, 740, 710], [8.2, 7.5, 8.0], [13.0, 12.2, 12.8])
  addSeries(1, 2, 2, 7, [810, 790, 830], [760, 740, 750], [9.1, 9.8, 8.9], [11.6, 12.0, 11.7])
  addSeries(1, 3, 3, 6, [790, 800, 810], [770, 760, 775], [10.2, 9.9, 9.7], [11.0, 11.4, 11.2])
  addSeries(1, 4, 4, 5, [760, 780, 770], [820, 830, 825], [11.5, 10.9, 11.2], [9.0, 8.8, 8.9])

  // Round 2 (1 vs 5, 2 vs 3)
  addSeries(2, 1, 1, 5, [900, 890, 905], [810, 820, 800], [7.2, 7.8, 7.1], [10.2, 10.0, 10.5])
  addSeries(2, 2, 2, 3, [830, 815, 820], [800, 790, 805], [8.8, 9.2, 8.9], [9.7, 10.1, 9.8])

  // Final (1 vs 2)
  addSeries(3, 1, 1, 2, [930, 920, 915], [880, 870, 885], [6.8, 7.0, 7.2], [8.4, 8.7, 8.3])

  return attempts
}

function App() {
  const initialLeaderboardTab: 'daily' | 'general' | 'tournament' | 'podium' = 'tournament'

  const [session, setSession] = useState<Session | null>(null)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
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
  const [leaderboardTab, setLeaderboardTab] = useState<'daily' | 'general' | 'tournament' | 'podium'>(initialLeaderboardTab)
  const [viewDate, setViewDate] = useState<string>(() => {
    const currentDate = todayKey()
    return currentDate > DAILY_LAST_DATE ? DAILY_LAST_DATE : currentDate
  })
  const [hasPlayedOnViewDate, setHasPlayedOnViewDate] = useState(false)
  const [isPracticeMode, setIsPracticeMode] = useState(false)
  const [practiceTargetHex, setPracticeTargetHex] = useState<string | null>(null)
  const [challengeDate, setChallengeDate] = useState<string | null>(null)
  const [activeTournamentMatchId, setActiveTournamentMatchId] = useState<string | null>(null)
  const [activeTournamentRoundNumber, setActiveTournamentRoundNumber] = useState<number | null>(null)
  const [activeTournamentMatchNumber, setActiveTournamentMatchNumber] = useState<number | null>(null)
  const [activeTournamentDuelIndex, setActiveTournamentDuelIndex] = useState<number | null>(null)
  const [activeTournamentTargetHex, setActiveTournamentTargetHex] = useState<string | null>(null)
  const [tournamentLoading, setTournamentLoading] = useState(false)
  const [tournamentRun, setTournamentRun] = useState<TournamentRun | null>(null)
  const [tournamentParticipants, setTournamentParticipants] = useState<TournamentParticipant[]>([])
  const [tournamentAttempts, setTournamentAttempts] = useState<TournamentAttempt[]>([])
  const [tournamentPodiumPredictions, setTournamentPodiumPredictions] = useState<TournamentPodiumPrediction[]>([])
  const [podiumSaving, setPodiumSaving] = useState(false)
  const [warmupUsesLeft, setWarmupUsesLeft] = useState(0)
  const [recordsClosestColor, setRecordsClosestColor] = useState<Array<{ userId: string; username: string; value: number; valueLabel: string; targetColor?: string; userColor?: string }>>([])
  const [recordsFarthestColor, setRecordsFarthestColor] = useState<Array<{ userId: string; username: string; value: number; valueLabel: string; targetColor?: string; userColor?: string }>>([])
  const [recordsHighestScore, setRecordsHighestScore] = useState<Array<{ userId: string; username: string; value: number; valueLabel: string; targetColor?: string; userColor?: string }>>([])
  const [recordsLowestScore, setRecordsLowestScore] = useState<Array<{ userId: string; username: string; value: number; valueLabel: string; targetColor?: string; userColor?: string }>>([])
  const [recordsMostFirstPlaces, setRecordsMostFirstPlaces] = useState<Array<{ userId: string; username: string; value: number; valueLabel: string; targetColor?: string; userColor?: string }>>([])
  const [recordsLoading, setRecordsLoading] = useState(false)

  const date = useMemo(() => todayKey(), [])
  const urlSearchParams = useMemo(() => {
    if (typeof window === 'undefined') {
      return new URLSearchParams()
    }
    return new URLSearchParams(window.location.search)
  }, [])
  const forceTournamentNow = useMemo(() => {
    return urlSearchParams.get('tournament') === '1'
  }, [urlSearchParams])
  const demoTournamentMode = useMemo(() => {
    return urlSearchParams.get('demoTournament') === '1'
  }, [urlSearchParams])
  const shouldForceTournament = forceTournamentNow || demoTournamentMode
  const isTournamentDate = shouldForceTournament || date >= TOURNAMENT_START_DATE
  const isDailyClosed = shouldForceTournament || date > DAILY_LAST_DATE

  const displayDate = useMemo(() => {
    const [year, month, day] = viewDate.split('-')
    return `${day}/${month}/${year}`
  }, [viewDate])
  const currentUsername = useMemo(() => {
    if (profileUsername && profileUsername.trim().length > 0) {
      return profileUsername.trim()
    }

    const metadataUsername = session?.user.user_metadata?.username
    if (typeof metadataUsername === 'string' && metadataUsername.trim().length > 0) {
      return metadataUsername.trim()
    }
    return fallbackUsername(session?.user.email, session?.user.id ?? 'anon')
  }, [profileUsername, session])
  const isLaraUser = useMemo(
    () => normalizeUsername(currentUsername) === NO_TIMER_USERNAME,
    [currentUsername],
  )
  const targetHex = useMemo(() => dailyTargetColor(date), [date])
  const challengeTargetHex = useMemo(
    () => isPracticeMode ? (practiceTargetHex ?? targetHex) : dailyTargetColor(challengeDate ?? date),
    [isPracticeMode, practiceTargetHex, targetHex, challengeDate, date],
  )
  const activeTargetHex = activeTournamentTargetHex ?? challengeTargetHex
  const selectedHex = useMemo(() => hsvToHex(pickerHsv), [pickerHsv])
  const canUseWarmupFeature = date >= WARMUP_START_DATE
  const warmupStorageKey = session ? `warmup-uses:${session.user.id}:${date}` : null
  const isBeforeFirstPlayableViewDate = viewDate < FIRST_PLAYABLE_DATE
  const isTimedScoreChallenge = isPracticeMode
  const isPreviewStage = stage === 'preview' || stage === 'tournamentPreview'
  const isPickStage = stage === 'pick' || stage === 'tournamentPick'
  const activeTimeCap = difficulty
    ? (isTimedScoreChallenge ? timeCaps[difficulty] : 0)
    : 0

  const tournamentParticipantByUserId = useMemo(() => {
    return tournamentParticipants.reduce<Record<string, TournamentParticipant>>((acc, participant) => {
      acc[participant.userId] = participant
      return acc
    }, {})
  }, [tournamentParticipants])

  const tournamentRounds = useMemo<TournamentRoundView[]>(() => {
    if (!tournamentRun || tournamentParticipants.length < 2) {
      return []
    }

    let currentRoundParticipants = [...tournamentParticipants].sort((a, b) => a.seed - b.seed)
    const rounds: TournamentRoundView[] = []
    let roundNumber = 1
    let safetyCounter = 0

    while (currentRoundParticipants.length > 1 && safetyCounter < 20) {
      safetyCounter += 1
      const pairings = buildRoundPairings(currentRoundParticipants)
      const roundMatches: TournamentMatchView[] = []
      const winners: TournamentParticipant[] = []

      for (const pairing of pairings) {
        const player1Attempts = getUserMatchAttempts(
          tournamentAttempts,
          roundNumber,
          pairing.matchNumber,
          pairing.player1Id,
        )
        const player2Attempts = pairing.player2Id
          ? getUserMatchAttempts(
              tournamentAttempts,
              roundNumber,
              pairing.matchNumber,
              pairing.player2Id,
            )
          : []

        let winnerUserId: string | null = pairing.autoWinnerId
        if (!winnerUserId && pairing.player2Id) {
          const isReady = player1Attempts.length >= DUELS_PER_MATCH && player2Attempts.length >= DUELS_PER_MATCH
          if (isReady) {
            let player1DuelWins = 0
            let player2DuelWins = 0

            for (let duelIndex = 1; duelIndex <= DUELS_PER_MATCH; duelIndex += 1) {
              const player1Duel = player1Attempts.find((attempt) => attempt.duelIndex === duelIndex)
              const player2Duel = player2Attempts.find((attempt) => attempt.duelIndex === duelIndex)

              if (!player1Duel || !player2Duel) {
                continue
              }

              if (player1Duel.score > player2Duel.score) {
                player1DuelWins += 1
              } else if (player2Duel.score > player1Duel.score) {
                player2DuelWins += 1
              }
            }

            if (player1DuelWins > player2DuelWins) {
              winnerUserId = pairing.player1Id
            } else if (player2DuelWins > player1DuelWins) {
              winnerUserId = pairing.player2Id
            } else {
              const player1TotalScore = sumMatchScore(player1Attempts)
              const player2TotalScore = sumMatchScore(player2Attempts)

              if (player1TotalScore > player2TotalScore) {
                winnerUserId = pairing.player1Id
              } else if (player2TotalScore > player1TotalScore) {
                winnerUserId = pairing.player2Id
              } else {
                const player1Error = sumMatchError(player1Attempts)
                const player2Error = sumMatchError(player2Attempts)

                if (player1Error < player2Error) {
                  winnerUserId = pairing.player1Id
                } else if (player2Error < player1Error) {
                  winnerUserId = pairing.player2Id
                } else {
                  const player1Seed = tournamentParticipantByUserId[pairing.player1Id]?.seed ?? Number.MAX_SAFE_INTEGER
                  const player2Seed = tournamentParticipantByUserId[pairing.player2Id]?.seed ?? Number.MAX_SAFE_INTEGER
                  winnerUserId = player1Seed <= player2Seed ? pairing.player1Id : pairing.player2Id
                }
              }
            }
          }
        }

        const player1 = tournamentParticipantByUserId[pairing.player1Id]
        const player2 = pairing.player2Id ? tournamentParticipantByUserId[pairing.player2Id] : null

        if (winnerUserId) {
          const winnerParticipant = tournamentParticipantByUserId[winnerUserId]
          if (winnerParticipant) {
            winners.push(winnerParticipant)
          }
        }

        roundMatches.push({
          id: `R${roundNumber}-M${pairing.matchNumber}`,
          roundNumber,
          matchNumber: pairing.matchNumber,
          winnerUserId,
          player1Id: pairing.player1Id,
          player2Id: pairing.player2Id,
          player1AttemptsDone: player1Attempts.length,
          player2AttemptsDone: player2Attempts.length,
          player1Score: sumMatchScore(player1Attempts),
          player2Score: sumMatchScore(player2Attempts),
        })

        if (!player1 || (pairing.player2Id && !player2)) {
          break
        }
      }

      rounds.push({
        roundNumber,
        matches: roundMatches,
      })

      const isRoundComplete = roundMatches.length > 0 && roundMatches.every((match) => Boolean(match.winnerUserId))
      if (!isRoundComplete) {
        break
      }

      currentRoundParticipants = winners.sort((a, b) => a.seed - b.seed)
      roundNumber += 1
    }

    return rounds
  }, [tournamentAttempts, tournamentParticipantByUserId, tournamentParticipants, tournamentRun])

  const championUserId = useMemo(() => {
    if (tournamentRounds.length === 0) {
      return null
    }

    const lastRound = tournamentRounds[tournamentRounds.length - 1]
    if (!lastRound.matches.every((match) => Boolean(match.winnerUserId))) {
      return null
    }

    if (lastRound.matches.length !== 1) {
      return null
    }

    return lastRound.matches[0].winnerUserId
  }, [tournamentRounds])

  const championName = championUserId
    ? (tournamentParticipantByUserId[championUserId]?.username ?? null)
    : null

  const myPodiumPrediction = useMemo(() => {
    if (!session) {
      return null
    }

    return tournamentPodiumPredictions.find((prediction) => prediction.voterUserId === session.user.id) ?? null
  }, [session, tournamentPodiumPredictions])

  const nextTournamentMatchId = useMemo(() => {
    if (!session) {
      return null
    }

    for (const round of tournamentRounds) {
      for (const match of round.matches) {
        if (!match.player2Id || match.winnerUserId) {
          continue
        }

        const isCurrentUserInMatch =
          match.player1Id === session.user.id || match.player2Id === session.user.id

        if (!isCurrentUserInMatch) {
          continue
        }

        const currentUserAttemptsDone =
          match.player1Id === session.user.id ? match.player1AttemptsDone : match.player2AttemptsDone

        if (currentUserAttemptsDone < DUELS_PER_MATCH) {
          return match.id
        }
      }
    }

    return null
  }, [session, tournamentRounds])

  const tournamentRoundsForUi = useMemo(() => {
    const currentUserId = session?.user.id
    const roundColorLockByRound = tournamentRounds.reduce<Record<number, boolean>>((acc, round) => {
      if (!currentUserId) {
        acc[round.roundNumber] = false
        return acc
      }

      const currentUserMatch = round.matches.find(
        (match) => match.player1Id === currentUserId || match.player2Id === currentUserId,
      )

      if (!currentUserMatch || !currentUserMatch.player2Id) {
        acc[round.roundNumber] = false
        return acc
      }

      const currentUserAttemptsDone =
        currentUserMatch.player1Id === currentUserId
          ? currentUserMatch.player1AttemptsDone
          : currentUserMatch.player2AttemptsDone

      acc[round.roundNumber] = currentUserAttemptsDone < DUELS_PER_MATCH
      return acc
    }, {})

    return tournamentRounds.map((round) => ({
      roundNumber: round.roundNumber,
      matches: round.matches.map((match) => {
        const hideOtherColorsInRound = roundColorLockByRound[round.roundNumber] ?? false
        const player1DuelAttempts = getUserMatchAttempts(
          tournamentAttempts,
          match.roundNumber,
          match.matchNumber,
          match.player1Id,
        )
        const player2DuelAttempts = match.player2Id
          ? getUserMatchAttempts(
              tournamentAttempts,
              match.roundNumber,
              match.matchNumber,
              match.player2Id,
            )
          : []

        const toDuelRows = (attempts: TournamentAttempt[], rivalAttempts: TournamentAttempt[]) => {
          return Array.from({ length: DUELS_PER_MATCH }, (_, index) => {
            const duelIndex = index + 1
            const attempt = attempts.find((item) => item.duelIndex === duelIndex)
            const rivalAttempt = rivalAttempts.find((item) => item.duelIndex === duelIndex)
            const sharedTargetColor = tournamentRun
              ? tournamentTargetColor(
                  tournamentRun.startDate,
                  match.roundNumber,
                  duelIndex,
                )
              : null
            let result: 'win' | 'loss' | 'tie' | 'pending' = 'pending'

            if (attempt && rivalAttempt) {
              if (attempt.score > rivalAttempt.score) {
                result = 'win'
              } else if (attempt.score < rivalAttempt.score) {
                result = 'loss'
              } else {
                result = 'tie'
              }
            }

            return {
              duelIndex,
              done: Boolean(attempt),
              targetColor: sharedTargetColor,
              userColor: attempt?.userColor ?? null,
              score: attempt?.score ?? null,
              error: attempt?.error ?? null,
              result,
            }
          })
        }

        const countDuelWins = (ownAttempts: TournamentAttempt[], rivalAttempts: TournamentAttempt[]): number => {
          let wins = 0
          for (let duelIndex = 1; duelIndex <= DUELS_PER_MATCH; duelIndex += 1) {
            const own = ownAttempts.find((attempt) => attempt.duelIndex === duelIndex)
            const rival = rivalAttempts.find((attempt) => attempt.duelIndex === duelIndex)
            if (!own || !rival) {
              continue
            }
            if (own.score > rival.score) {
              wins += 1
            }
          }
          return wins
        }

        const player1DuelWins = countDuelWins(player1DuelAttempts, player2DuelAttempts)
        const player2DuelWins = countDuelWins(player2DuelAttempts, player1DuelAttempts)

        const player1 = tournamentParticipantByUserId[match.player1Id]
        const player2 = match.player2Id ? tournamentParticipantByUserId[match.player2Id] : null
        const isCurrentUserInMatch = currentUserId
          ? match.player1Id === currentUserId || match.player2Id === currentUserId
          : false

        const currentUserAttemptsDone = currentUserId
          ? (match.player1Id === currentUserId ? match.player1AttemptsDone : match.player2AttemptsDone)
          : 0

        return {
          id: match.id,
          roundNumber: match.roundNumber,
          matchNumber: match.matchNumber,
          winnerUserId: match.winnerUserId,
          player1DuelWins,
          player2DuelWins,
          player1: {
            userId: match.player1Id,
            username: player1?.username ?? fallbackUsername(undefined, match.player1Id),
            attemptsDone: match.player1AttemptsDone,
            totalScore: match.player1Score,
            revealColors: !hideOtherColorsInRound || match.player1Id === currentUserId,
            duels: toDuelRows(player1DuelAttempts, player2DuelAttempts),
          },
          player2: player2
            ? {
                userId: player2.userId,
                username: player2.username,
                attemptsDone: match.player2AttemptsDone,
                totalScore: match.player2Score,
                revealColors: !hideOtherColorsInRound || player2.userId === currentUserId,
                duels: toDuelRows(player2DuelAttempts, player1DuelAttempts),
              }
            : null,
          isCurrentUserInMatch,
          canCurrentUserPlay:
            isCurrentUserInMatch &&
            !match.winnerUserId &&
            Boolean(player2) &&
            currentUserAttemptsDone < DUELS_PER_MATCH,
        }
      }),
    }))
  }, [session, tournamentAttempts, tournamentParticipantByUserId, tournamentRounds, tournamentRun])

  const refreshTournamentData = useCallback(async () => {
    if (!session || !isTournamentDate) {
      setTournamentRun(null)
      setTournamentParticipants([])
      setTournamentAttempts([])
      setTournamentPodiumPredictions([])
      return
    }

    setTournamentLoading(true)

    if (demoTournamentMode) {
      const demoRunId = 'demo-run-2026-05-13'
      const demoParticipants = createDemoTournamentParticipants()
      const demoAttempts = createDemoTournamentAttempts(demoRunId, TOURNAMENT_START_DATE, demoParticipants)

      setTournamentRun({
        id: demoRunId,
        startDate: TOURNAMENT_START_DATE,
        status: 'finished',
        championUserId: demoParticipants[0]?.userId ?? null,
      })
      setTournamentParticipants(demoParticipants)
      setTournamentAttempts(demoAttempts)
      setTournamentPodiumPredictions([])
      setTournamentLoading(false)
      return
    }

    const fetchStandingsForSeeding = async (): Promise<LeaderboardEntry[]> => {
      const { data: attemptsData, error: attemptsError } = await supabase
        .from('attempts')
        .select('user_id,score')
        .lte('date', DAILY_LAST_DATE)

      if (attemptsError || !attemptsData) {
        return []
      }

      const uniqueUserIds = [...new Set(attemptsData.map((attempt) => attempt.user_id))]
      let usernameById: Record<string, string> = {}

      if (uniqueUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id,username')
          .in('id', uniqueUserIds)

        usernameById = (profilesData ?? []).reduce<Record<string, string>>((acc, profile) => {
          acc[profile.id] = profile.username
          return acc
        }, {})
      }

      const aggregated = uniqueUserIds.map((uid) => {
        const userAttempts = attemptsData.filter((attempt) => attempt.user_id === uid)
        return {
          userId: uid,
          username:
            usernameById[uid] ??
            fallbackUsername(
              uid === session.user.id ? session.user.email : undefined,
              uid,
            ),
          totalScore: userAttempts.reduce((sum, attempt) => sum + attempt.score, 0),
          gamesPlayed: userAttempts.length,
        }
      })

      aggregated.sort((a, b) => b.totalScore - a.totalScore)
      return aggregated
    }

    const { data: existingRun } = await supabase
      .from('tournament_runs')
      .select('id,start_date,status,champion_user_id')
      .eq('start_date', TOURNAMENT_START_DATE)
      .maybeSingle()

    let runId = existingRun?.id ?? null

    if (!runId) {
      const standings = await fetchStandingsForSeeding()
      if (standings.length >= 2) {
        const { data: createdRun, error: runInsertError } = await supabase
          .from('tournament_runs')
          .insert({
            start_date: TOURNAMENT_START_DATE,
            status: 'active',
          })
          .select('id,start_date,status,champion_user_id')
          .single()

        if (!runInsertError && createdRun) {
          runId = createdRun.id
          const participantsToInsert = standings.map((entry, index) => ({
            run_id: createdRun.id,
            user_id: entry.userId,
            seed: index + 1,
          }))

          await supabase.from('tournament_participants').insert(participantsToInsert)
        }
      }
    }

    if (!runId) {
      setTournamentRun(null)
      setTournamentParticipants([])
      setTournamentAttempts([])
      setTournamentPodiumPredictions([])
      setTournamentLoading(false)
      return
    }

    const [{ data: runData }, { data: participantsData }, { data: attemptsData }, { data: predictionsData }] = await Promise.all([
      supabase
        .from('tournament_runs')
        .select('id,start_date,status,champion_user_id')
        .eq('id', runId)
        .single(),
      supabase
        .from('tournament_participants')
        .select('user_id,seed')
        .eq('run_id', runId)
        .order('seed', { ascending: true }),
      supabase
        .from('tournament_attempts')
        .select('id,run_id,user_id,round_number,match_number,duel_index,target_color,user_color,error,time,score')
        .eq('run_id', runId),
      supabase
        .from('tournament_podium_predictions')
        .select('run_id,voter_user_id,first_user_id,second_user_id,third_user_id')
        .eq('run_id', runId),
    ])

    const participantUserIds = [...new Set((participantsData ?? []).map((participant) => participant.user_id))]
    let usernameById: Record<string, string> = {}

    if (participantUserIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id,username')
        .in('id', participantUserIds)

      usernameById = (profilesData ?? []).reduce<Record<string, string>>((acc, profile) => {
        acc[profile.id] = profile.username
        return acc
      }, {})
    }

    setTournamentRun(
      runData
        ? {
            id: runData.id,
            startDate: runData.start_date,
            status: runData.status,
            championUserId: runData.champion_user_id,
          }
        : null,
    )

    setTournamentParticipants(
      (participantsData ?? []).map((participant) => ({
        userId: participant.user_id,
        username: usernameById[participant.user_id] ?? fallbackUsername(undefined, participant.user_id),
        seed: participant.seed,
      })),
    )

    setTournamentAttempts(
      (attemptsData ?? []).map((attempt) => ({
        id: attempt.id,
        runId: attempt.run_id,
        userId: attempt.user_id,
        roundNumber: attempt.round_number,
        matchNumber: attempt.match_number,
        duelIndex: attempt.duel_index,
        targetColor: attempt.target_color,
        userColor: attempt.user_color,
        error: attempt.error,
        time: attempt.time,
        score: attempt.score,
      })),
    )

    setTournamentPodiumPredictions(
      (predictionsData ?? []).map((prediction) => ({
        runId: prediction.run_id,
        voterUserId: prediction.voter_user_id,
        firstUserId: prediction.first_user_id,
        secondUserId: prediction.second_user_id,
        thirdUserId: prediction.third_user_id,
      })),
    )

    setTournamentLoading(false)
  }, [demoTournamentMode, isTournamentDate, session])

  const savePodiumPrediction = useCallback(async (
    firstUserId: string,
    secondUserId: string,
    thirdUserId: string,
  ) => {
    if (!session || !tournamentRun) {
      setErrorText('No se pudo guardar la porra. Intenta actualizar la pestaña.')
      return
    }

    const picks = [firstUserId, secondUserId, thirdUserId]
    if (picks.some((pick) => pick.length === 0) || new Set(picks).size !== 3) {
      setErrorText('Debes seleccionar 3 jugadores distintos para la porra.')
      return
    }

    if (picks.includes(session.user.id)) {
      setErrorText('No puedes votarte a ti mismo en la porra del podio.')
      return
    }

    setPodiumSaving(true)
    setErrorText(null)

    const { error: upsertError } = await supabase
      .from('tournament_podium_predictions')
      .upsert(
        {
          run_id: tournamentRun.id,
          voter_user_id: session.user.id,
          first_user_id: firstUserId,
          second_user_id: secondUserId,
          third_user_id: thirdUserId,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'run_id,voter_user_id',
        },
      )

    if (upsertError) {
      setErrorText(upsertError.message ?? 'No se pudo guardar la porra.')
      setPodiumSaving(false)
      return
    }

    await refreshTournamentData()
    setPodiumSaving(false)
  }, [refreshTournamentData, session, tournamentRun])

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
          .select('user_id,score,user_color,target_color,error')
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
      const averageError =
        userAttempts.length > 0
          ? userAttempts.reduce((sum, a) => sum + a.error, 0) / userAttempts.length
          : 100
      const accuracyPercent = Math.max(0, 100 - averageError)

      return {
        userId: uid,
        username: (() => {
          const baseUsername =
            usernameById[uid] ??
            fallbackUsername(
              uid === session.user.id ? session.user.email : undefined,
              uid,
            )

          return baseUsername
        })(),
        totalScore: userAttempts.reduce((sum, a) => sum + a.score, 0),
        gamesPlayed: userAttempts.length,
        userColor: userAttempts[0]?.user_color,
        targetColor: userAttempts[0]?.target_color,
        accuracyPercent,
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
          .select('user_id,score,date'),
      ])

    if (ownError || leaderboardError) {
      setErrorText((ownError || leaderboardError)?.message ?? 'No se pudo cargar el estado diario.')
      setLoadingData(false)
      return
    }

    setHasPlayedToday(Boolean(ownAttempt))

    const attempts = (allAttemptsData ?? []).filter((attempt) => attempt.date <= DAILY_LAST_DATE)
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

  const refreshRecords = useCallback(async () => {
    if (!session) {
      return
    }

    setRecordsLoading(true)

    try {
      // Get all attempts
      const { data: allAttemptsData, error: attemptsError } = await supabase
        .from('attempts')
        .select('id,user_id,score,error,target_color,user_color,date')

      if (attemptsError || !allAttemptsData) {
        setRecordsLoading(false)
        return
      }

      // Get all user IDs
      const userIds = [...new Set(allAttemptsData.map((a) => a.user_id))]

      // Get usernames
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

      // Calculate closest color (lowest error)
      const closestColorMap = new Map<string, { error: number; targetColor?: string; userColor?: string }>()
      for (const attempt of allAttemptsData) {
        const current = closestColorMap.get(attempt.user_id)
        if (!current || attempt.error < current.error) {
          closestColorMap.set(attempt.user_id, {
            error: attempt.error,
            targetColor: attempt.target_color,
            userColor: attempt.user_color,
          })
        }
      }

      const closestColor = Array.from(closestColorMap.entries())
        .map(([userId, data]) => ({
          userId,
          username: usernameById[userId] ?? fallbackUsername(undefined, userId),
          value: Math.max(0, 100 - data.error),
          valueLabel: `${data.error.toFixed(2)}% de error`,
          targetColor: data.targetColor,
          userColor: data.userColor,
        }))
        .sort((a, b) => b.value - a.value)

      // Calculate farthest color (highest error)
      const farthestColorMap = new Map<string, { error: number; targetColor?: string; userColor?: string }>()
      for (const attempt of allAttemptsData) {
        const current = farthestColorMap.get(attempt.user_id)
        if (!current || attempt.error > current.error) {
          farthestColorMap.set(attempt.user_id, {
            error: attempt.error,
            targetColor: attempt.target_color,
            userColor: attempt.user_color,
          })
        }
      }

      const farthestColor = Array.from(farthestColorMap.entries())
        .map(([userId, data]) => ({
          userId,
          username: usernameById[userId] ?? fallbackUsername(undefined, userId),
          value: Math.max(0, 100 - data.error),
          valueLabel: `${data.error.toFixed(2)}% de error`,
          targetColor: data.targetColor,
          userColor: data.userColor,
        }))
        .sort((a, b) => a.value - b.value)

      // Calculate highest score (global attempts, not per-user best)
      const highestScore = allAttemptsData
        .map((attempt) => ({
          userId: attempt.user_id,
          username: usernameById[attempt.user_id] ?? fallbackUsername(undefined, attempt.user_id),
          value: attempt.score,
          valueLabel: `Reto del ${attempt.date}`,
          targetColor: attempt.target_color,
          userColor: attempt.user_color,
        }))
        .sort((a, b) => b.value - a.value)

      // Calculate lowest score (global attempts)
      const lowestScore = allAttemptsData
        .map((attempt) => ({
          userId: attempt.user_id,
          username: usernameById[attempt.user_id] ?? fallbackUsername(undefined, attempt.user_id),
          value: attempt.score,
          valueLabel: `Reto del ${attempt.date}`,
          targetColor: attempt.target_color,
          userColor: attempt.user_color,
        }))
        .sort((a, b) => a.value - b.value)

      // Calculate most first places
      const dailyWinnersMap = new Map<string, Set<string>>()

      // Group attempts by date
      const attemptsByDate = new Map<string, typeof allAttemptsData>()
      for (const attempt of allAttemptsData) {
        if (!attemptsByDate.has(attempt.date)) {
          attemptsByDate.set(attempt.date, [])
        }
        attemptsByDate.get(attempt.date)!.push(attempt)
      }

      // For each date, find who had the highest score
      for (const [date, dayAttempts] of attemptsByDate.entries()) {
        if (dayAttempts.length === 0) continue
        let winner: string | null = null
        let maxScore = -1
        for (const attempt of dayAttempts) {
          if (attempt.score > maxScore) {
            maxScore = attempt.score
            winner = attempt.user_id
          }
        }
        if (winner) {
          if (!dailyWinnersMap.has(winner)) {
            dailyWinnersMap.set(winner, new Set())
          }
          dailyWinnersMap.get(winner)!.add(date)
        }
      }

      const mostFirstPlaces = Array.from(dailyWinnersMap.entries())
        .map(([userId, dates]) => ({
          userId,
          username: usernameById[userId] ?? fallbackUsername(undefined, userId),
          value: dates.size,
          valueLabel: `${dates.size} reto${dates.size !== 1 ? 's' : ''} ganado${dates.size !== 1 ? 's' : ''}`,
        }))
        .sort((a, b) => b.value - a.value)

      setRecordsClosestColor(closestColor)
      setRecordsFarthestColor(farthestColor)
      setRecordsHighestScore(highestScore)
      setRecordsLowestScore(lowestScore)
      setRecordsMostFirstPlaces(mostFirstPlaces)
    } finally {
      setRecordsLoading(false)
    }
  }, [session])

  const resolveAuthorizedSession = useCallback(async (nextSession: Session | null) => {
    if (!nextSession) {
      setProfileUsername(null)
      return null
    }

    try {
      const authorizedUsername = await verifyAuthorizedUser(nextSession.user.id)

      if (!authorizedUsername) {
        await supabase.auth.signOut()
        setProfileUsername(null)
        setAuthError(UNAUTHORIZED_ACCESS_MESSAGE)
        return null
      }

      setProfileUsername(authorizedUsername)
      setAuthError(null)
      return nextSession
    } catch {
      await supabase.auth.signOut()
      setProfileUsername(null)
      setAuthError('No se pudo validar tu acceso. Intentalo otra vez.')
      return null
    }
  }, [])

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      const authorizedSession = await resolveAuthorizedSession(data.session)
      setSession(authorizedSession)
      setAuthLoading(false)
    }

    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        const authorizedSession = await resolveAuthorizedSession(nextSession)
        setSession(authorizedSession)
        setStage('home')
        setResult(null)
        setHasPlayedToday(false)
        setIsPracticeMode(false)
        setActiveTournamentMatchId(null)
        setActiveTournamentRoundNumber(null)
        setActiveTournamentMatchNumber(null)
        setActiveTournamentDuelIndex(null)
        setActiveTournamentTargetHex(null)
      })()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [resolveAuthorizedSession])

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
    if (!session) {
      return
    }
    void refreshRecords()
  }, [refreshRecords, session])

  useEffect(() => {
    if (!session) {
      return
    }
    void refreshTournamentData()
  }, [refreshTournamentData, session])

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
    if (!isPreviewStage || !difficulty) {
      return
    }

    const total = previewSecondsByDifficulty[difficulty]
    setPreviewCountdown(total)

    if (isLaraUser) {
      const timeout = window.setTimeout(() => {
        setStage(stage === 'preview' ? 'pick' : 'tournamentPick')
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
        setStage(stage === 'preview' ? 'pick' : 'tournamentPick')
        setPickStartedAt(Date.now())
      }
    }, 50)

    return () => window.clearInterval(interval)
  }, [difficulty, isLaraUser, isPreviewStage, stage])

  useEffect(() => {
    if (!isPickStage || !difficulty || pickStartedAt === null) {
      return
    }

    if (isLaraUser || !isTimedScoreChallenge) {
      return
    }

    const tick = () => {
      setPickElapsedSeconds((Date.now() - pickStartedAt) / 1000)
    }

    tick()
    const interval = window.setInterval(tick, 100)
    return () => window.clearInterval(interval)
  }, [difficulty, isLaraUser, isPickStage, isTimedScoreChallenge, pickStartedAt])

  // Skip preview immediately on PrintScreen or window blur/visibility change
  useEffect(() => {
    if (!isPreviewStage) {
      return
    }

    const skipToPickNow = () => {
      setStage(stage === 'preview' ? 'pick' : 'tournamentPick')
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
  }, [isPreviewStage, stage])

  const beginChallenge = (targetDate?: string) => {
    if (!session || !profileUsername) {
      setErrorText('Debes estar registrado para jugar. Por favor cierra sesion y vuelve a intentarlo.')
      return
    }

    const dateToUse = targetDate ?? date

    if (dateToUse < FIRST_PLAYABLE_DATE) {
      setErrorText('No se puede jugar antes del 04/05/2026.')
      return
    }

    if (dateToUse > DAILY_LAST_DATE) {
      setErrorText('El reto diario finalizo el 12/05/2026. Desde el 13/05/2026 comienza el torneo.')
      return
    }

    const hasAlreadyPlayed = dateToUse === date ? hasPlayedToday : hasPlayedOnViewDate
    
    if (hasAlreadyPlayed) {
      return
    }
    setIsPracticeMode(false)
    setPracticeTargetHex(null)
    setChallengeDate(dateToUse === date ? null : dateToUse)
    setErrorText(null)
    setResult(null)
    setDifficulty('hard')
    setPickerHsv(defaultHsv)
    setStage('preview')
  }

  const beginTournamentDuel = (matchId: string) => {
    if (!session || !profileUsername || !tournamentRun) {
      setErrorText('No se pudo iniciar el duelo. Intenta actualizar la pestaña de torneo.')
      return
    }

    const selectedRound = tournamentRounds.find((round) =>
      round.matches.some((match) => match.id === matchId),
    )
    const selectedMatch = selectedRound?.matches.find((match) => match.id === matchId)

    if (!selectedRound || !selectedMatch || !selectedMatch.player2Id || selectedMatch.winnerUserId) {
      setErrorText('Este emparejamiento no esta disponible para duelo.')
      return
    }

    const isCurrentUserInMatch =
      selectedMatch.player1Id === session.user.id || selectedMatch.player2Id === session.user.id

    if (!isCurrentUserInMatch) {
      setErrorText('Solo puedes jugar tus propios emparejamientos.')
      return
    }

    const currentUserAttempts =
      selectedMatch.player1Id === session.user.id
        ? selectedMatch.player1AttemptsDone
        : selectedMatch.player2AttemptsDone

    if (currentUserAttempts >= DUELS_PER_MATCH) {
      setErrorText('Ya completaste tus 3 pruebas en este duelo.')
      return
    }

    const duelIndex = currentUserAttempts + 1
    const targetForDuel = tournamentTargetColor(
      tournamentRun.startDate,
      selectedRound.roundNumber,
      duelIndex,
    )

    setErrorText(null)
    setResult(null)
    setDifficulty('hard')
    setPickerHsv(defaultHsv)
    setActiveTournamentMatchId(matchId)
    setActiveTournamentRoundNumber(selectedRound.roundNumber)
    setActiveTournamentMatchNumber(selectedMatch.matchNumber)
    setActiveTournamentDuelIndex(duelIndex)
    setActiveTournamentTargetHex(targetForDuel)
    setStage('tournamentPreview')
  }

  const beginPracticeChallenge = () => {
    if (!session || !profileUsername) {
      setErrorText('Debes estar registrado para jugar. Por favor cierra sesion y vuelve a intentarlo.')
      return
    }

    if (isDailyClosed) {
      setErrorText('El calentamiento solo estaba disponible durante los retos diarios.')
      return
    }

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
    if (!session || !profileUsername || !difficulty || pickStartedAt === null || submitting) {
      setErrorText('Tu sesion expiro. Por favor cierra sesion y vuelve a intentarlo.')
      return
    }

    setSubmitting(true)
    setErrorText(null)

    const elapsedSeconds = (Date.now() - pickStartedAt) / 1000
    const error = colorErrorPercent(activeTargetHex, selectedHex)
    const isTournamentConfirm =
      stage === 'tournamentPick' &&
      tournamentRun &&
      activeTournamentRoundNumber !== null &&
      activeTournamentMatchNumber !== null &&
      activeTournamentDuelIndex !== null

    const score = scoreAttempt(
      error,
      elapsedSeconds,
      difficulty,
      isTournamentConfirm ? undefined : (isTimedScoreChallenge ? activeTimeCap : undefined),
      isTournamentConfirm ? false : isTimedScoreChallenge,
    )

    if (isTournamentConfirm) {
      const sharedTargetColor = tournamentTargetColor(
        tournamentRun.startDate,
        activeTournamentRoundNumber,
        activeTournamentDuelIndex,
      )

      const { error: insertDuelError } = await supabase.from('tournament_attempts').insert({
        run_id: tournamentRun.id,
        user_id: session.user.id,
        round_number: activeTournamentRoundNumber,
        match_number: activeTournamentMatchNumber,
        duel_index: activeTournamentDuelIndex,
        target_color: sharedTargetColor,
        user_color: selectedHex,
        error,
        time: elapsedSeconds,
        score,
      })

      if (insertDuelError) {
        setErrorText(insertDuelError.message ?? 'No se pudo guardar el duelo.')
        setSubmitting(false)
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
      setStage('result')
      setSubmitting(false)
      await refreshTournamentData()
      return
    }

    if (isPracticeMode) {
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

    const playedDateKey = challengeDate ?? date

    // Final authorization check before saving
    try {
      const authorizedUsername = await verifyAuthorizedUser(session.user.id)
      if (!authorizedUsername) {
        setErrorText('Tu cuenta ha sido desautorizada. Por favor cierra sesion e intenta de nuevo.')
        await supabase.auth.signOut()
        setProfileUsername(null)
        setSubmitting(false)
        return
      }
    } catch {
      setErrorText('No se pudo validar tu acceso. Intentalo otra vez.')
      setSubmitting(false)
      return
    }

    const { error: insertError } = await supabase.from('attempts').insert({
      user_id: session.user.id,
      date: playedDateKey,
      difficulty,
      target_color: dailyTargetColor(playedDateKey),
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
      await Promise.all([
        refreshDailyState(),
        refreshDailyLeaderboard(playedDateKey),
      ])
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
    await Promise.all([
      refreshDailyState(),
      refreshDailyLeaderboard(playedDateKey),
    ])
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const handlePrimaryAction = () => {
    if (leaderboardTab === 'tournament') {
      if (nextTournamentMatchId) {
        beginTournamentDuel(nextTournamentMatchId)
      }
      return
    }

    if (leaderboardTab === 'podium') {
      return
    }

    beginChallenge(viewDate)
  }

  if (authLoading) {
    return <p className="p-8 text-center">Cargando sesion...</p>
  }

  if (!session) {
    return <AuthScreen externalError={authError} />
  }

  return (
    <div className="bg-animated min-h-screen px-3 py-6 text-zinc-900 sm:px-4 sm:py-8">
      <main className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-zinc-900/10 bg-white/80 p-6 shadow-lg backdrop-blur md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-black">Reto PreAltet</h1>
            <p className="text-sm text-zinc-600">
              {isDailyClosed
                ? 'Torneo eliminatorio activo desde el 13/05/2026'
                : `Reto de hoy: ${displayDate}`}
            </p>
          </div>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:w-auto md:flex-wrap md:justify-end">
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={(() => {
                if (leaderboardTab === 'tournament') {
                  return !isTournamentDate || tournamentLoading || !nextTournamentMatchId
                }

                if (leaderboardTab === 'podium') {
                  return true
                }

                return (
                  hasPlayedOnViewDate ||
                  loadingData ||
                  leaderboardTab !== 'daily' ||
                  isBeforeFirstPlayableViewDate ||
                  isDailyClosed
                )
              })()}
                className="w-full rounded-lg bg-zinc-950 px-5 py-3 font-semibold text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
            >
              {leaderboardTab === 'tournament'
                ? !isTournamentDate
                  ? 'Torneo no disponible'
                  : nextTournamentMatchId
                    ? 'Realizar duelo'
                    : 'Sin duelos pendientes'
                : leaderboardTab === 'podium'
                  ? 'Completa la porra abajo'
                : isDailyClosed
                  ? 'Reto diario finalizado'
                  : isBeforeFirstPlayableViewDate
                    ? 'No disponible'
                    : hasPlayedOnViewDate
                      ? 'Reto ya completado'
                      : 'Reto Diario'}
            </button>
            {canUseWarmupFeature && (
              <button
                type="button"
                onClick={beginPracticeChallenge}
                disabled={loadingData || hasPlayedToday || warmupUsesLeft <= 0 || isDailyClosed}
                className="w-full rounded-lg border border-amber-400 bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
              >
                {isDailyClosed
                  ? 'Calentamiento finalizado'
                  : hasPlayedToday
                  ? 'Calentamiento bloqueado'
                  : `Calentamiento (${warmupUsesLeft}/${WARMUP_MAX_USES})`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setStage('records')}
              disabled={!hasPlayedToday}
              className="w-full rounded-lg border border-blue-400 bg-blue-100 px-4 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
            >
              Récords
            </button>
            <button
              type="button"
              onClick={signOut}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-700 transition hover:bg-zinc-100 md:w-auto"
            >
              Salir
            </button>
          </div>
        </header>

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
              <button
                type="button"
                onClick={() => setLeaderboardTab('tournament')}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                  leaderboardTab === 'tournament'
                    ? 'bg-zinc-900 text-zinc-100 shadow'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Torneo
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardTab('podium')}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                  leaderboardTab === 'podium'
                    ? 'bg-zinc-900 text-zinc-100 shadow'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Porra
              </button>
            </div>
            {leaderboardTab === 'daily' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-900/10 bg-white/80 px-3 py-2 shadow backdrop-blur">
                  <button
                    type="button"
                    disabled={viewDate <= FIRST_PLAYABLE_DATE}
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
                    disabled={viewDate >= (date > DAILY_LAST_DATE ? DAILY_LAST_DATE : date)}
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
                  title={`Clasificacion${viewDate === (date > DAILY_LAST_DATE ? DAILY_LAST_DATE : date) ? ' del dia' : ''} · ${displayDate}`}
                  showColors={viewDate < date || hasPlayedOnViewDate}
                />
              </div>
            ) : leaderboardTab === 'general' ? (
              <Leaderboard entries={leaderboard} title="Clasificacion general" />
            ) : leaderboardTab === 'tournament' ? (
              <TournamentTab
                isTournamentDate={isTournamentDate}
                loading={tournamentLoading}
                hasRun={Boolean(tournamentRun)}
                championName={championName}
                rounds={tournamentRoundsForUi}
                onRefresh={() => {
                  void refreshTournamentData()
                }}
              />
            ) : (
              <PodiumPoolTab
                isTournamentDate={isTournamentDate}
                loading={tournamentLoading}
                saving={podiumSaving}
                currentUserId={session.user.id}
                participants={tournamentParticipants}
                predictions={tournamentPodiumPredictions}
                myPrediction={myPodiumPrediction}
                onSave={(firstUserId, secondUserId, thirdUserId) => {
                  void savePodiumPrediction(firstUserId, secondUserId, thirdUserId)
                }}
                onRefresh={() => {
                  void refreshTournamentData()
                }}
              />
            )}
          </div>
        )}

        {isPreviewStage && difficulty && (
          <section className="rounded-3xl border border-zinc-900/10 bg-white/85 p-8 text-center shadow-lg backdrop-blur">
            <p className="text-sm text-zinc-500">Memoriza este color</p>
            <div className="mx-auto mt-4 h-52 w-full max-w-md rounded-3xl border border-zinc-900/15 shadow-inner transition-opacity duration-500" style={{ backgroundColor: activeTargetHex }} />
            {!isLaraUser && (
              <p className="mt-4 text-4xl font-black text-zinc-900">{previewCountdown.toFixed(1)}s</p>
            )}
            <p className="mt-2 text-sm text-zinc-600">{difficultyDescription[difficulty]}</p>
          </section>
        )}

        {isPickStage && difficulty && (
          <section className="grid gap-6 rounded-3xl border border-zinc-900/10 bg-white/85 p-6 shadow-lg backdrop-blur md:grid-cols-2">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-wide text-zinc-500">Color oculto</p>
              <div className="flex h-52 items-center justify-center rounded-3xl border border-dashed border-zinc-400 bg-zinc-100 text-zinc-500">
                Recrealo con tu memoria
              </div>
              <p className="text-sm text-zinc-600">Dificultad: {difficulty.toUpperCase()}</p>
              <div className="rounded-2xl border border-zinc-900/10 bg-zinc-50 p-3">
                {!isLaraUser && isTimedScoreChallenge && (
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
            <h2 className="text-2xl font-black text-zinc-900">
              {activeTournamentMatchId ? 'Resultado del duelo' : 'Resultado del dia'}
            </h2>
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
              onClick={() => {
                setStage('home')
                setActiveTournamentMatchId(null)
                setActiveTournamentRoundNumber(null)
                setActiveTournamentMatchNumber(null)
                setActiveTournamentDuelIndex(null)
                setActiveTournamentTargetHex(null)
                if (activeTournamentMatchId) {
                  setLeaderboardTab('tournament')
                }
              }}
              className="mt-5 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
            >
              {activeTournamentMatchId ? 'Volver al torneo' : 'Volver al leaderboard'}
            </button>
          </section>
        )}

        {stage === 'records' && (
          <>
            <div className="flex items-center justify-between gap-4 rounded-3xl border border-zinc-900/10 bg-white/80 p-4 shadow-lg backdrop-blur sm:p-6">
              <h2 className="text-2xl font-bold text-zinc-900">Récords Globales</h2>
              <button
                type="button"
                onClick={() => setStage('home')}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
              >
                Volver
              </button>
            </div>
            <Records
              closestColor={recordsClosestColor}
              farthestColor={recordsFarthestColor}
              highestScore={recordsHighestScore}
              lowestScore={recordsLowestScore}
              mostFirstPlaces={recordsMostFirstPlaces}
              loading={recordsLoading}
            />
          </>
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
