import { dailyTargetColor } from './dailyChallenge'
import type { TournamentAttempt, TournamentParticipant } from '../types'

export const DAILY_LAST_DATE = '2026-05-12'
export const TOURNAMENT_START_DATE = '2026-05-13'
export const DUELS_PER_MATCH = 3

export type SeededPairing = {
  matchNumber: number
  player1Id: string
  player2Id: string | null
  autoWinnerId: string | null
}

export const buildRoundPairings = (
  participants: TournamentParticipant[],
  roundNumber: number,
  previousRoundScores: Record<string, number> = {},
): SeededPairing[] => {
  let orderedParticipants = [...participants]

  if (roundNumber === 1) {
    orderedParticipants.sort((a, b) => a.seed - b.seed)
  } else {
    orderedParticipants.sort((a, b) => {
      const scoreDiff = (previousRoundScores[b.userId] ?? 0) - (previousRoundScores[a.userId] ?? 0)
      if (scoreDiff !== 0) {
        return scoreDiff
      }
      return a.seed - b.seed
    })
  }

  const pairings: SeededPairing[] = []
  if (orderedParticipants.length % 2 !== 0 && orderedParticipants.length > 0) {
    const byePlayer = orderedParticipants.shift()
    if (byePlayer) {
      pairings.push({
        matchNumber: 1,
        player1Id: byePlayer.userId,
        player2Id: null,
        autoWinnerId: byePlayer.userId,
      })
    }
  }

  const half = orderedParticipants.length / 2
  for (let i = 0; i < half; i += 1) {
    const topSeed = orderedParticipants[i]
    const lowSeed = orderedParticipants[orderedParticipants.length - 1 - i]
    pairings.push({
      matchNumber: pairings.length + 1,
      player1Id: topSeed.userId,
      player2Id: lowSeed.userId,
      autoWinnerId: null,
    })
  }

  return pairings
}

export const tournamentTargetColor = (
  tournamentStartDate: string,
  roundNumber: number,
  duelIndex: number,
): string => {
  const key = `${tournamentStartDate}:R${roundNumber}:D${duelIndex}`
  return dailyTargetColor(key)
}

export const getUserMatchAttempts = (
  attempts: TournamentAttempt[],
  roundNumber: number,
  matchNumber: number,
  userId: string,
): TournamentAttempt[] => {
  return attempts
    .filter(
      (attempt) =>
        attempt.roundNumber === roundNumber &&
        attempt.matchNumber === matchNumber &&
        attempt.userId === userId,
    )
    .sort((a, b) => a.duelIndex - b.duelIndex)
}

export const sumMatchScore = (attempts: TournamentAttempt[]): number => {
  return attempts.reduce((sum, attempt) => sum + attempt.score, 0)
}

export const sumMatchError = (attempts: TournamentAttempt[]): number => {
  return attempts.reduce((sum, attempt) => sum + attempt.error, 0)
}
