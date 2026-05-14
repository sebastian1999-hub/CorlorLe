import type { PointerEvent } from 'react'
import type { HSV } from '../types'
import { hsvToHex } from '../lib/colorMath'

type HsvPickerProps = {
  value: HSV
  onChange: (next: HSV) => void
}

type Channel = 'h' | 's' | 'v'

const sliderConfig: Record<Channel, { min: number; max: number; label: string }> = {
  h: { min: 0, max: 359, label: 'Hue' },
  s: { min: 0, max: 100, label: 'Saturation' },
  v: { min: 0, max: 100, label: 'Value' },
}

export function HsvPicker({ value, onChange }: HsvPickerProps) {
  const preview = hsvToHex(value)

  const clampToChannel = (channel: Channel, nextValue: number): number => {
    const { min, max } = sliderConfig[channel]
    return Math.max(min, Math.min(max, nextValue))
  }

  const handleChannel = (channel: Channel, rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10)
    const safeValue = Number.isNaN(parsed) ? sliderConfig[channel].min : clampToChannel(channel, parsed)

    onChange({
      ...value,
      [channel]: safeValue,
    })
  }

  const capturePointer = (event: PointerEvent<HTMLInputElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const releasePointer = (event: PointerEvent<HTMLInputElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="grid gap-4 rounded-3xl border border-zinc-900/10 bg-white p-5 shadow-lg">
      <div className="rounded-2xl border border-zinc-300 p-3">
        <div
          className="h-24 w-full rounded-xl border border-zinc-900/20"
          style={{ backgroundColor: preview }}
          aria-label="Color seleccionado"
        />
        <p className="mt-2 text-center font-mono text-sm text-zinc-700">{preview.toUpperCase()}</p>
      </div>

      {(['h', 's', 'v'] as Channel[]).map((channel) => (
        <label key={channel} className="block">
          <div className="mb-1 flex items-center justify-between text-sm text-zinc-700">
            <span>{sliderConfig[channel].label}</span>
            <span className="font-semibold">{value[channel]}</span>
          </div>
          <input
            type="range"
            min={sliderConfig[channel].min}
            max={sliderConfig[channel].max}
            value={value[channel]}
            onChange={(event) => handleChannel(channel, event.target.value)}
            onPointerDown={capturePointer}
            onPointerUp={releasePointer}
            onPointerCancel={releasePointer}
            className="w-full accent-amber-500"
          />
        </label>
      ))}
    </div>
  )
}
