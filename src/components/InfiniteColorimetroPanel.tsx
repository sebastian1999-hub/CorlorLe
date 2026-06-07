import { useEffect, useRef, useState } from 'react'
import { HsvPicker } from './HsvPicker'
import { colorErrorPercent, hsvToHex } from '../lib/colorMath'
import type { HSV } from '../types'

type InfiniteColorimetroPanelProps = {
  onRunFailed: (floorsCompleted: number) => void | Promise<void>
  onBackToLeaderboard: () => void
}

type RunPhase = 'idle' | 'preview' | 'playing' | 'success' | 'failed'

type RunState = {
  phase: RunPhase
  floorsCompleted: number
  targetHex: string
  picker: HSV
  previewSecondsLeft: number
  lastError: number | null
  message: string | null
}

const DEFAULT_PICKER: HSV = { h: 200, s: 70, v: 70 }
const PREVIEW_SECONDS = 3
const MAX_ALLOWED_ERROR = 15
const MIN_ALLOWED_ERROR = 1

const randomTargetHex = (): string => {
  const h = Math.floor(Math.random() * 360)
  const s = 35 + Math.random() * 65
  const v = 35 + Math.random() * 60
  return hsvToHex({ h, s, v })
}

const allowedErrorForFloor = (floorsCompleted: number): number => {
  return Math.max(MIN_ALLOWED_ERROR, MAX_ALLOWED_ERROR - floorsCompleted)
}

const passesFloor = (error: number, allowedError: number): boolean => {
  if (allowedError <= MIN_ALLOWED_ERROR) {
    return error <= MIN_ALLOWED_ERROR
  }

  return error < allowedError
}

const createInitialState = (): RunState => ({
  phase: 'idle',
  floorsCompleted: 0,
  targetHex: randomTargetHex(),
  picker: DEFAULT_PICKER,
  previewSecondsLeft: PREVIEW_SECONDS,
  lastError: null,
  message: null,
})

export function InfiniteColorimetroPanel({ onRunFailed, onBackToLeaderboard }: InfiniteColorimetroPanelProps) {
  const [run, setRun] = useState<RunState>(createInitialState)
  const [savingResult, setSavingResult] = useState(false)
  const hasReportedFailureRef = useRef(false)

  useEffect(() => {
    if (run.phase !== 'preview') {
      return
    }

    const intervalId = window.setInterval(() => {
      setRun((previous) => {
        if (previous.phase !== 'preview') {
          return previous
        }

        const nextSeconds = Math.max(0, previous.previewSecondsLeft - 0.1)
        if (nextSeconds > 0) {
          return {
            ...previous,
            previewSecondsLeft: nextSeconds,
          }
        }

        return {
          ...previous,
          phase: 'playing',
          previewSecondsLeft: 0,
          message: 'Ahora recrea el color con el minimo error posible.',
        }
      })
    }, 100)

    return () => window.clearInterval(intervalId)
  }, [run.phase])

  useEffect(() => {
    if (run.phase !== 'failed' || hasReportedFailureRef.current) {
      return
    }

    hasReportedFailureRef.current = true
    setSavingResult(true)

    Promise.resolve(onRunFailed(run.floorsCompleted)).finally(() => {
      setSavingResult(false)
    })
  }, [onRunFailed, run.floorsCompleted, run.phase])

  const startRun = () => {
    hasReportedFailureRef.current = false
    setRun({
      ...createInitialState(),
      phase: 'preview',
      message: 'Memoriza el color objetivo.',
      previewSecondsLeft: PREVIEW_SECONDS,
    })
  }

  const continueRun = () => {
    setRun((previous) => ({
      ...previous,
      phase: 'preview',
      targetHex: randomTargetHex(),
      picker: DEFAULT_PICKER,
      previewSecondsLeft: PREVIEW_SECONDS,
      lastError: null,
      message: `Piso ${previous.floorsCompleted + 1}. Memoriza el nuevo color.`,
    }))
  }

  const resetRun = () => {
    hasReportedFailureRef.current = false
    setRun(createInitialState())
  }

  const submitAttempt = () => {
    if (run.phase !== 'playing') {
      return
    }

    const selectedHex = hsvToHex(run.picker)
    const error = colorErrorPercent(run.targetHex, selectedHex)
    const allowedError = allowedErrorForFloor(run.floorsCompleted)

    if (passesFloor(error, allowedError)) {
      setRun((previous) => ({
        ...previous,
        phase: 'success',
        floorsCompleted: previous.floorsCompleted + 1,
        lastError: error,
        message: 'Piso superado con exito.',
      }))
      return
    }

    setRun((previous) => ({
      ...previous,
      phase: 'failed',
      lastError: error,
      message: `Fallaste en el piso ${previous.floorsCompleted + 1}.`,
    }))
  }

  const allowedError = allowedErrorForFloor(run.floorsCompleted)

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/90 p-4 shadow-lg backdrop-blur sm:p-6">
      {/* Info strip always visible */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Modo infinito</p>
          <p className="mt-1 text-sm text-zinc-700">
            Piso <span className="font-black">{run.floorsCompleted + 1}</span>
          </p>
        </div>
        <p className="text-sm text-zinc-700">
          Objetivo: <span className="font-black text-amber-600">{allowedError <= MIN_ALLOWED_ERROR ? '1% o menos' : `menos de ${allowedError}%`}</span>
        </p>
      </div>

      {/* PREVIEW: color full-width, no picker */}
      {run.phase === 'preview' && (
        <div className="space-y-3">
          <p className="text-center text-sm font-semibold text-zinc-600">Memoriza este color</p>
          <div className="h-64 w-full rounded-2xl border border-zinc-300 shadow-inner sm:h-72" style={{ backgroundColor: run.targetHex }} />
          <p className="text-center text-3xl font-black text-zinc-900">{run.previewSecondsLeft.toFixed(1)}s</p>
        </div>
      )}

      {/* PLAYING: picker full-width, color hidden */}
      {run.phase === 'playing' && (
        <div className="space-y-4">
          <div className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-zinc-400 bg-zinc-100/80 text-sm text-zinc-500">
            Color oculto — recrealo con tu memoria
          </div>
          <HsvPicker value={run.picker} onChange={(next) => setRun((previous) => ({ ...previous, picker: next }))} />
          <button
            type="button"
            onClick={submitAttempt}
            className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400"
          >
            Confirmar color
          </button>
        </div>
      )}

      {/* SUCCESS */}
      {run.phase === 'success' && (
        <div className="space-y-4">
          {run.lastError !== null && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Error: <span className="font-black">{run.lastError.toFixed(2)}%</span> — ¡Piso superado!
            </p>
          )}
          <HsvPicker value={run.picker} onChange={(next) => setRun((previous) => ({ ...previous, picker: next }))} />
          <button
            type="button"
            onClick={continueRun}
            className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400"
          >
            Siguiente piso
          </button>
        </div>
      )}

      {/* FAILED */}
      {run.phase === 'failed' && (
        <div className="space-y-4">
          {run.lastError !== null && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Error: <span className="font-black">{run.lastError.toFixed(2)}%</span> — Fallaste en el piso {run.floorsCompleted + 1}.
            </p>
          )}
          <button
            type="button"
            onClick={() => { onBackToLeaderboard(); resetRun() }}
            disabled={savingResult}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingResult ? 'Guardando resultado...' : 'Volver a la clasificacion'}
          </button>
          <button
            type="button"
            onClick={resetRun}
            disabled={savingResult}
            className="w-full rounded-lg bg-zinc-950 px-4 py-3 font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
          >
            Intentar de nuevo
          </button>
        </div>
      )}

      {/* IDLE */}
      {run.phase === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Empieza tu racha infinita. Cada piso baja el margen de error en 1%.</p>
          <button
            type="button"
            onClick={startRun}
            className="w-full rounded-lg bg-zinc-950 px-4 py-3 font-semibold text-white transition hover:bg-zinc-800"
          >
            Iniciar modo infinito
          </button>
        </div>
      )}

      {/* Reset button always available except idle/failed */}
      {(run.phase === 'playing' || run.phase === 'preview') && (
        <button
          type="button"
          onClick={resetRun}
          className="mt-3 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100"
        >
          Reiniciar intento
        </button>
      )}
    </section>
  )
}
