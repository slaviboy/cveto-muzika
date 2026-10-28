/**
 * Onset detection on a (bass) level signal: positive flux compared with an adaptive threshold
 * (mean + k·σ of recent flux). Emits a decaying `pulse` and a monotonically increasing `count`.
 */
export class BeatDetector {
  pulse = 0
  count = 0
  strength = 0
  private history = new Float32Array(72)
  private index = 0
  private filled = 0
  private prev = 0
  private lastBeat = -Infinity

  process(level: number, nowMs: number, dtSeconds: number, sensitivity: number): boolean {
    const flux = Math.max(0, level - this.prev)
    this.prev = level

    let mean = 0
    for (let i = 0; i < this.filled; i++) mean += this.history[i]
    mean = this.filled ? mean / this.filled : 0
    let variance = 0
    for (let i = 0; i < this.filled; i++) variance += (this.history[i] - mean) ** 2
    const std = this.filled ? Math.sqrt(variance / this.filled) : 0

    this.history[this.index] = flux
    this.index = (this.index + 1) % this.history.length
    this.filled = Math.min(this.history.length, this.filled + 1)

    this.pulse *= Math.exp(-dtSeconds / 0.16)
    const threshold = mean + sensitivity * std
    const isBeat = this.filled > 12 && flux > threshold && flux > 0.025 && level > 0.12 && nowMs - this.lastBeat > 140
    if (isBeat) {
      this.lastBeat = nowMs
      this.count++
      this.strength = Math.min(1, level * 0.6 + (flux - threshold) * 4)
      this.pulse = Math.max(this.pulse, 0.5 + 0.5 * this.strength)
    }
    return isBeat
  }

  reset() {
    this.history.fill(0)
    this.filled = 0
    this.pulse = 0
    this.prev = 0
  }
}
