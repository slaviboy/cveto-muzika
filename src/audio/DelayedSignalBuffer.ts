/**
 * Timestamped ring buffer of control vectors (e.g. [level, peak, sub-bands…]).
 * Reading at an arbitrary past time linearly interpolates between the two bracketing frames,
 * which turns a per-channel "response delay" into a true time shift independent of frame rate.
 */
export class DelayedSignalBuffer {
  readonly width: number
  readonly capacity: number
  private times: Float64Array
  private data: Float32Array
  /** Physical index of the next write. */
  private head = 0
  private count = 0

  constructor(width = 1, capacity = 512) {
    this.width = Math.max(1, Math.floor(width))
    this.capacity = Math.max(2, Math.floor(capacity))
    this.times = new Float64Array(this.capacity)
    this.data = new Float32Array(this.capacity * this.width)
  }

  get size() {
    return this.count
  }

  get oldestTime(): number {
    return this.count ? this.times[this.physical(0)] : NaN
  }

  get newestTime(): number {
    return this.count ? this.times[this.physical(this.count - 1)] : NaN
  }

  clear() {
    this.head = 0
    this.count = 0
  }

  /** Appends a frame. Timestamps must be non-decreasing; an equal timestamp overwrites the newest frame. */
  push(time: number, values: ArrayLike<number> | number, offset = 0) {
    let slot: number
    if (this.count && time <= this.newestTime) {
      slot = this.physical(this.count - 1)
    } else {
      slot = this.head
      this.head = (this.head + 1) % this.capacity
      if (this.count < this.capacity) this.count++
    }
    this.times[slot] = time
    const base = slot * this.width
    if (typeof values === 'number') {
      this.data[base] = values
      for (let i = 1; i < this.width; i++) this.data[base + i] = 0
    } else {
      for (let i = 0; i < this.width; i++) this.data[base + i] = values[offset + i] ?? 0
    }
  }

  /**
   * Writes the interpolated vector at `time` into `out`. Times before the oldest frame clamp to
   * the oldest; times after the newest clamp to the newest. Returns false when the buffer is empty.
   */
  read(time: number, out: Float32Array | number[], outOffset = 0): boolean {
    if (!this.count) return false
    const w = this.width
    const lastLogical = this.count - 1
    if (time <= this.times[this.physical(0)]) {
      this.copy(this.physical(0), out, outOffset)
      return true
    }
    if (time >= this.times[this.physical(lastLogical)]) {
      this.copy(this.physical(lastLogical), out, outOffset)
      return true
    }
    // Binary search for the last frame with t <= time.
    let lo = 0
    let hi = lastLogical
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.times[this.physical(mid)] <= time) lo = mid
      else hi = mid
    }
    const a = this.physical(lo)
    const b = this.physical(hi)
    const ta = this.times[a]
    const tb = this.times[b]
    const t = tb > ta ? (time - ta) / (tb - ta) : 0
    const ba = a * w
    const bb = b * w
    for (let i = 0; i < w; i++) {
      const va = this.data[ba + i]
      out[outOffset + i] = va + (this.data[bb + i] - va) * t
    }
    return true
  }

  /** Convenience scalar read of one component. */
  readScalar(time: number, component = 0): number {
    if (!this.count) return 0
    const tmp = this.scalarScratch
    if (this.width === 1) {
      this.read(time, tmp)
      return tmp[0]
    }
    const full = this.vectorScratch ?? (this.vectorScratch = new Float32Array(this.width))
    this.read(time, full)
    return full[component]
  }

  private scalarScratch = new Float32Array(1)
  private vectorScratch: Float32Array | null = null

  private physical(logical: number): number {
    return (this.head - this.count + logical + this.capacity) % this.capacity
  }

  private copy(slot: number, out: Float32Array | number[], outOffset: number) {
    const base = slot * this.width
    for (let i = 0; i < this.width; i++) out[outOffset + i] = this.data[base + i]
  }
}
