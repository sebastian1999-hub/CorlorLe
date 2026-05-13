export type Difficulty = 'easy' | 'medium' | 'hard'

export type RGB = {
  r: number
  g: number
  b: number
}

export type HSV = {
  h: number
  s: number
  v: number
}

export type AttemptRow = {
  id: string
  user_id: string
  date: string
  difficulty: Difficulty
  target_color: string
  user_color: string
  error: number
  time: number
  score: number
}

export type LeaderboardEntry = {
  userId: string
  username: string
  totalScore: number
  gamesPlayed: number
  userColor?: string
  targetColor?: string
  accuracyPercent?: number
}

export type TournamentRun = {
  id: string
  startDate: string
  status: 'active' | 'finished'
  championUserId: string | null
}

export type TournamentParticipant = {
  userId: string
  username: string
  seed: number
}

export type TournamentAttempt = {
  id: string
  runId: string
  userId: string
  roundNumber: number
  matchNumber: number
  duelIndex: number
  targetColor: string
  userColor: string
  error: number
  time: number
  score: number
}

export type TournamentMatch = {
  id: string
  roundNumber: number
  matchNumber: number
  player1Id: string
  player2Id: string | null
  winnerId: string | null
  finishedAt: string | null
}

export type TournamentMatchPrediction = {
  runId: string
  voterUserId: string
  roundNumber: number
  matchNumber: number
  predictedWinnerUserId: string
}
