import type { Difficulty } from '../types'
import { difficultyLabel } from '../lib/scoring'

type DifficultyPickerProps = {
  onSelect: (difficulty: Difficulty) => void
  onCancel: () => void
}

const difficulties: Difficulty[] = ['easy', 'medium', 'hard']

export function DifficultyPicker({ onSelect, onCancel }: DifficultyPickerProps) {
  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/80 p-6 shadow-lg backdrop-blur">
      <h2 className="text-2xl font-black text-zinc-900">Selecciona dificultad</h2>
      <p className="mt-1 text-sm text-zinc-600">El color objetivo es el mismo para todos , la dificultad solo cambia el tiempo que podeis verlo.</p>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {difficulties.map((difficulty) => (
          <button
            key={difficulty}
            type="button"
            onClick={() => onSelect(difficulty)}
            className="rounded-2xl border border-zinc-900/15 bg-zinc-950 p-6 text-center text-zinc-100 transition hover:-translate-y-0.5 hover:border-amber-300"
          >
            <p className="text-xl font-bold text-amber-300">{difficultyLabel[difficulty]}</p>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="mt-5 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
      >
        Volver
      </button>
    </section>
  )
}
