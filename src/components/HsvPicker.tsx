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
  const hueGradient = 'linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
  const saturationGradient = `linear-gradient(90deg, hsl(${value.h} 0% ${value.v}%), hsl(${value.h} 100% ${value.v}%))`
  const valueGradient = `linear-gradient(90deg, hsl(${value.h} ${value.s}% 0%), hsl(${value.h} ${value.s}% 50%), hsl(${value.h} ${value.s}% 100%))`

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
    <div className="grid gap-4 rounded-3xl border border-zinc-900/10 bg-white p-4 shadow-lg sm:p-5">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
        <div
          className="h-28 w-full rounded-xl border border-zinc-900/20 shadow-inner"
          style={{ backgroundColor: preview }}
          aria-label="Color seleccionado"
        />
        <p className="mt-2 text-center font-mono text-sm font-semibold text-zinc-700">{preview.toUpperCase()}</p>
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
            className="hsv-slider w-full"
            style={{
              background: channel === 'h'
                ? hueGradient
                : channel === 's'
                  ? saturationGradient
                  : valueGradient,
            }}
          />
        </label>
      ))}
    </div>
  )
}
