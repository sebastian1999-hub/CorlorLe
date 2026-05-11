import type { RGB } from '../types'

const hashString = (value: string): number => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const mulberry32 = (seed: number) => {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hsvToRgb = (h: number, s: number, v: number): RGB => {
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

export const rgbToHex = (rgb: RGB): string => {
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0')
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

export const todayKey = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const dailyTargetColor = (dateKey: string): string => {
  const random = mulberry32(hashString(dateKey))
  const h = random() * 360
  const s = 0.45 + random() * 0.5
  const v = 0.5 + random() * 0.45

  return rgbToHex(hsvToRgb(h, s, v))
}
