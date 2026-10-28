/**
 * Automatic gain normalisation: a slow peak follower per slot; gain pulls the followed peak toward
 * `target`. Attack is fast so loud passages are tamed quickly, release is slow so quiet passages
 * are lifted gradually instead of pumping noise.
 */
export class AutoGain {
  private env: Float32Array
  private gains: Float32Array

  constructor(size: number) {
    this.env = new Float32Array(size).fill(0.5)
    this.gains = new Float32Array(size).fill(1)
  }

  resize(size: number) {
    if (size === this.env.length) return
    this.env = new Float32Array(size).fill(0.5)
    this.gains = new Float32Array(size).fill(1)
  }

  /** Feeds the pre-gain level for a slot and returns the gain to apply. */
  process(slot: number, level: number, dtSeconds: number, target: number): number {
    let e = this.env[slot]
    const tau = level > e ? 0.08 : 4
    e += (level - e) * (1 - Math.exp(-dtSeconds / tau))
    this.env[slot] = e
    const desired = Math.min(6, Math.max(0.5, target / Math.max(e, 0.06)))
    const g = this.gains[slot] + (desired - this.gains[slot]) * (1 - Math.exp(-dtSeconds / 0.6))
    this.gains[slot] = g
    return g
  }

  gain(slot: number): number {
    return this.gains[slot]
  }
}
