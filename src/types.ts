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
}
