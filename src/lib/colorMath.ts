import type { HSV, RGB } from '../types'

const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255)

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const hexToRgb = (hex: string): RGB => {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((ch) => ch + ch)
        .join('')
    : normalized

  const intValue = Number.parseInt(value, 16)

  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  }
}

export const rgbToHex = (rgb: RGB): string => {
  const toHex = (channel: number) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

export const hsvToRgb = (hsv: HSV): RGB => {
  const h = ((hsv.h % 360) + 360) % 360
  const s = clamp(hsv.s / 100, 0, 1)
  const v = clamp(hsv.v / 100, 0, 1)

  const c = v * s
  const hh = h / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))

  let r = 0
  let g = 0
  let b = 0

  if (hh >= 0 && hh < 1) {
    r = c
    g = x
  } else if (hh >= 1 && hh < 2) {
    r = x
    g = c
  } else if (hh >= 2 && hh < 3) {
    g = c
    b = x
  } else if (hh >= 3 && hh < 4) {
    g = x
    b = c
  } else if (hh >= 4 && hh < 5) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  const m = v - c

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

export const hsvToHex = (hsv: HSV): string => rgbToHex(hsvToRgb(hsv))

export const colorErrorPercent = (targetHex: string, selectedHex: string): number => {
  const target = hexToRgb(targetHex)
  const selected = hexToRgb(selectedHex)

  const distance = Math.sqrt(
    (target.r - selected.r) ** 2 +
      (target.g - selected.g) ** 2 +
      (target.b - selected.b) ** 2,
  )

  return clamp((distance / MAX_RGB_DISTANCE) * 100, 0, 100)
}
