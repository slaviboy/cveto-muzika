/**
 * Frame-rate independent smoothing. A time constant τ (ms) gives the per-frame coefficient
 * 1 − e^(−dt/τ), so the response is the same at 30, 60 or 144 fps.
 *
 * This is *smoothing*, not delay: the output starts moving immediately. True delay lives in
 * DelayedSignalBuffer.
 */
export function smoothingCoefficient(dtSeconds: number, timeConstantMs: number): number {
  if (timeConstantMs <= 0) return 1
  return 1 - Math.exp((-dtSeconds * 1000) / timeConstantMs)
}

export function exponentialSmooth(current: number, target: number, dtSeconds: number, timeConstantMs: number): number {
  return current + (target - current) * smoothingCoefficient(dtSeconds, timeConstantMs)
}

/** Envelope follower bank with separate attack (rising) and release (falling) time constants. */
export class EnvelopeFollower {
  values: Float32Array

  constructor(size: number) {
    this.values = new Float32Array(size)
  }

  resize(size: number) {
    if (size === this.values.length) return
    const next = new Float32Array(size)
    next.set(this.values.subarray(0, Math.min(size, this.values.length)))
    this.values = next
  }

  process(index: number, target: number, attackMs: number, releaseMs: number, dtSeconds: number): number {
    const current = this.values[index]
    const tau = target > current ? attackMs : releaseMs
    const next = current + (target - current) * smoothingCoefficient(dtSeconds, tau)
    this.values[index] = next
    return next
  }

  reset() {
    this.values.fill(0)
  }
}

/** Peak hold: jumps to new maxima, holds for `holdMs`, then falls at `decayPerSecond` (units/s). */
export class PeakHold {
  values: Float32Array
  private holdLeft: Float32Array

  constructor(size: number) {
    this.values = new Float32Array(size)
    this.holdLeft = new Float32Array(size)
  }

  resize(size: number) {
    if (size === this.values.length) return
    this.values = new Float32Array(size)
    this.holdLeft = new Float32Array(size)
  }

  process(index: number, value: number, holdMs: number, decayPerSecond: number, dtSeconds: number): number {
    let peak = this.values[index]
    if (value >= peak) {
      peak = value
      this.holdLeft[index] = holdMs
    } else if (this.holdLeft[index] > 0) {
      this.holdLeft[index] -= dtSeconds * 1000
    } else {
      peak = Math.max(value, peak - decayPerSecond * dtSeconds)
    }
    this.values[index] = peak
    return peak
  }

  reset() {
    this.values.fill(0)
    this.holdLeft.fill(0)
  }
}
