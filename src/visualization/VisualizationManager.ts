import type * as THREE from 'three'
import type { Settings, VisualizationMode } from '../state/settingsSchema'
import type { BaseVisualization, FrameContext } from './BaseVisualization'
import { BarVisualization } from './BarVisualization'
import { LedRingVisualization } from './LedRingVisualization'
import { RingVisualization } from './RingVisualization'
import { SquareVisualization } from './SquareVisualization'

export const VISUALIZATION_FACTORIES: Record<VisualizationMode, () => BaseVisualization> = {
  rings: () => new RingVisualization(),
  leds: () => new LedRingVisualization(),
  bars: () => new BarVisualization(),
  squares: () => new SquareVisualization(),
}

/**
 * Holds exactly one live visualization. Switching modes disposes the previous one (geometry,
 * materials, scene nodes) before creating the next, so GPU memory never accumulates.
 */
export class VisualizationManager {
  private current: BaseVisualization | null = null
  private parent: THREE.Object3D
  private factories: Record<VisualizationMode, () => BaseVisualization>

  constructor(parent: THREE.Object3D, factories: Record<VisualizationMode, () => BaseVisualization> = VISUALIZATION_FACTORIES) {
    this.parent = parent
    this.factories = factories
  }

  get active(): BaseVisualization | null {
    return this.current
  }

  get mode(): VisualizationMode | null {
    return this.current?.mode ?? null
  }

  ensure(mode: VisualizationMode): BaseVisualization {
    if (this.current?.mode === mode) return this.current
    this.current?.dispose()
    this.current = this.factories[mode]()
    this.parent.add(this.current.root)
    return this.current
  }

  subbands(settings: Settings): number {
    return this.ensure(settings.mode).subbands(settings)
  }

  update(ctx: FrameContext) {
    this.ensure(ctx.settings.mode).update(ctx)
  }

  dispose() {
    this.current?.dispose()
    this.current = null
  }
}
