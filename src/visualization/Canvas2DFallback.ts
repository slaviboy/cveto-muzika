import type { AudioEngine } from '../audio/AudioEngine'
import type { AudioPipeline } from '../audio/AudioPipeline'
import { liveData } from '../state/liveData'
import type { Settings } from '../state/settingsSchema'

/**
 * Minimal Canvas 2D renderer used when WebGL2 is unavailable. It runs the same audio pipeline and
 * draws simplified rings (rings / LED / squares modes) or bars, so the app stays usable.
 */
export class Canvas2DFallback {
  readonly canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D | null
  private raf = 0
  private running = false
  private observer: ResizeObserver
  private container: HTMLElement
  private audio: AudioEngine
  private pipeline: AudioPipeline
  private getSettings: () => Settings

  constructor(container: HTMLElement, audio: AudioEngine, pipeline: AudioPipeline, getSettings: () => Settings) {
    this.container = container
    this.audio = audio
    this.pipeline = pipeline
    this.getSettings = getSettings
    this.canvas.className = 'aurora-canvas'
    this.canvas.setAttribute('aria-hidden', 'true')
    container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(container)
    this.resize()
  }

  private resize() {
    const r = this.container.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    this.canvas.width = Math.max(1, Math.round(r.width * dpr))
    this.canvas.height = Math.max(1, Math.round(r.height * dpr))
  }

  start() {
    this.running = true
    this.raf = requestAnimationFrame(this.frame)
  }

  dispose() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.observer.disconnect()
    this.canvas.remove()
  }

  private frame = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)
    const s = this.getSettings()
    this.pipeline.setSubbandCount(16)
    const f = this.pipeline.process(now, { analyser: this.audio.activeAnalyser, sampleRate: this.audio.sampleRate }, s)
    liveData.frame = f
    const g = this.ctx
    if (!g) return
    const w = this.canvas.width
    const h = this.canvas.height
    g.globalCompositeOperation = 'source-over'
    g.fillStyle = s.background.colorB
    g.fillRect(0, 0, w, h)
    g.globalCompositeOperation = 'lighter'
    const channels = s.channels.map((ch, i) => ({ ch, i })).filter((x) => x.ch.enabled)
    const unit = Math.min(w, h) / 2

    if (s.mode === 'bars') {
      const K = f.subbandCount
      const total = channels.length * K
      const bw = (w * 0.9) / Math.max(1, total)
      channels.forEach(({ ch, i }, e) => {
        for (let j = 0; j < K; j++) {
          const v = Math.min(1.2, f.sub[i * K + j] ?? 0)
          const x = w * 0.05 + (e * K + j) * bw
          const bh = v * h * 0.75
          g.fillStyle = ch.color
          g.shadowColor = ch.color
          g.shadowBlur = 12 * v
          g.globalAlpha = 0.25 + 0.75 * Math.min(1, v)
          g.fillRect(x + bw * 0.15, h * 0.88 - bh, bw * 0.7, bh)
        }
      })
    } else {
      const square = s.mode === 'squares'
      channels.forEach(({ ch, i }, e) => {
        const v = Math.min(1.5, f.intensity[i] ?? 0)
        const t = channels.length === 1 ? 0.5 : e / (channels.length - 1)
        const r = unit * (0.2 + 0.7 * t) * (1 + 0.04 * v)
        g.strokeStyle = ch.color
        g.shadowColor = ch.color
        g.shadowBlur = 24 * v
        g.globalAlpha = 0.25 + 0.75 * Math.min(1, v)
        g.lineWidth = (1 + 6 * v) * (w / this.container.clientWidth || 1)
        g.beginPath()
        if (square) g.rect(w / 2 - r, h / 2 - r, r * 2, r * 2)
        else g.arc(w / 2, h / 2, r, 0, Math.PI * 2)
        g.stroke()
      })
    }
    g.globalAlpha = 1
    g.shadowBlur = 0
  }
}
