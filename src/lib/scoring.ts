import type { Difficulty } from '../types'

const multipliers: Record<Difficulty, number> = {
  easy: 1,
  medium: 1.5,
  hard: 2.2,
}

export const timeCaps: Record<Difficulty, number> = {
  easy: 60,
  medium: 45,
  hard: 30,
}

export const previewSecondsByDifficulty: Record<Difficulty, number> = {
  easy: 7,
  medium: 4,
  hard: 2,
}

export const scoreAttempt = (
  error: number,
  seconds: number,
  difficulty: Difficulty,
  timeCapOverrideSeconds?: number,
  includeTimeBonus = true,
): number => {
  const accuracy = Math.max(0, 100 - error)
  const timeBonusFactor = includeTimeBonus
    ? Math.max(0, 1 - seconds / (timeCapOverrideSeconds ?? timeCaps[difficulty]))
    : 0

  const baseScore = accuracy * 10 + timeBonusFactor * 100
  const total = baseScore * multipliers[difficulty]

  return Math.round(total * 100) / 100
}

export const difficultyLabel: Record<Difficulty, string> = {
  easy: 'Facil',
  medium: 'Medio',
  hard: 'Dificil',
}

export const difficultyDescription: Record<Difficulty, string> = {
  easy: '7s de vista previa. Multiplicador x1.0',
  medium: '4s de vista previa. Multiplicador x1.5',
  hard: '2s de vista previa. Multiplicador x2.2',
}
