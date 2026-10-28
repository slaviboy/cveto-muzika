export function stepDecimals(step: number) {
  const s = String(step)
  return s.includes('.') ? s.split('.')[1].length : 0
}

export function roundTo(v: number, step: number) {
  return Number((Math.round(v / step) * step).toFixed(stepDecimals(step)))
}

export function formatNumber(v: number, digits: number) {
  if (!Number.isFinite(v)) return '—'
  return v.toFixed(digits)
}
