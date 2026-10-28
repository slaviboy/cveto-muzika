/**
 * Frame-time tracking and adaptive resolution. Steps the render scale down quickly when frames
 * run over budget and back up slowly (with hysteresis) when there is sustained headroom.
 */
export class PerformanceMonitor {
  fps = 60
  frameMs = 1000 / 60
  scale = 1
  private targetMs = 1000 / 60
  private slowFor = 0
  private fastFor = 0
  private cooldown = 0
  private bestMs = Infinity
  private bestAge = 0

  sample(dtMs: number) {
    if (!(dtMs > 0) || dtMs > 250) return
    this.frameMs += (dtMs - this.frameMs) * 0.06
    this.fps = 1000 / this.frameMs
    // Track the display's refresh interval from the fastest recent frames.
    this.bestAge += dtMs
    if (dtMs < this.bestMs || this.bestAge > 5000) {
      this.bestMs = dtMs
      this.bestAge = 0
    }
    this.targetMs = Math.max(1000 / 165, Math.min(1000 / 50, this.bestMs * 1.02))
  }

  /** Returns true when the scale changed. */
  adapt(dtMs: number, enabled: boolean, minScale: number): boolean {
    if (!enabled) {
      const changed = this.scale !== 1
      this.scale = 1
      return changed
    }
    this.cooldown = Math.max(0, this.cooldown - dtMs)
    if (this.frameMs > this.targetMs * 1.3) {
      this.slowFor += dtMs
      this.fastFor = 0
    } else if (this.frameMs < this.targetMs * 1.08) {
      this.fastFor += dtMs
      this.slowFor = 0
    } else {
      this.slowFor = Math.max(0, this.slowFor - dtMs)
      this.fastFor = Math.max(0, this.fastFor - dtMs)
    }
    if (this.slowFor > 900 && this.scale > minScale) {
      this.scale = Math.max(minScale, this.scale - 0.1)
      this.slowFor = 0
      this.cooldown = 8000
      return true
    }
    if (this.fastFor > 4000 && this.cooldown <= 0 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.05)
      this.fastFor = 0
      return true
    }
    return false
  }
}
