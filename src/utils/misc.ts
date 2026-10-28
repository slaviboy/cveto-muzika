export const clamp = (x: number, min: number, max: number) => (x < min ? min : x > max ? max : x)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

let idCounter = 0
export function createId(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  idCounter = (idCounter + 1) % 1296
  return `${prefix}_${rand}${idCounter.toString(36)}`
}

export type DeepPartial<T> = T extends readonly (infer U)[]
  ? readonly U[] | U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Recursively merges plain objects; arrays and primitives from `patch` replace `base`. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value
  }
  return out as T
}

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null
  const run = () => {
    timer = null
    if (pending) {
      const args = pending
      pending = null
      fn(...args)
    }
  }
  const debounced = (...args: A) => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, ms)
  }
  debounced.flush = () => {
    if (timer) clearTimeout(timer)
    run()
  }
  return debounced
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'preset'
  )
}
