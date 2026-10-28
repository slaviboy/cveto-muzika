import { useEffect, useRef, useState } from 'react'
import { audioEngine, pipeline } from '../../app/engine'
import { isReducedMotion } from '../../hooks'
import { supportsWebGL2 } from '../../rendering/capabilities'
import { Renderer } from '../../rendering/Renderer'
import { getSettings, useAppStore } from '../../state/useAppStore'
import { Canvas2DFallback } from '../../visualization/Canvas2DFallback'

/**
 * Hosts the renderer. React only mounts/unmounts it; the render loop runs outside React.
 * On WebGL context loss the renderer is torn down and rebuilt on restore.
 */
export function VisualizerCanvas() {
  const ref = useRef<HTMLDivElement>(null)
  const webgl2 = useAppStore((s) => s.system.webgl2)
  const setSystem = useAppStore((s) => s.setSystem)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    setSystem({ webgl2: supportsWebGL2() })
  }, [setSystem])

  useEffect(() => {
    const container = ref.current
    if (webgl2 === null || !container) return
    if (!webgl2) {
      const fallback = new Canvas2DFallback(container, audioEngine, pipeline, getSettings)
      fallback.start()
      return () => fallback.dispose()
    }
    let renderer: Renderer
    try {
      renderer = new Renderer({
        container,
        audio: audioEngine,
        pipeline,
        getSettings,
        isReducedMotion,
        onContextLost: () => setSystem({ contextLost: true }),
        onContextRestored: () => {
          setSystem({ contextLost: false })
          setGeneration((g) => g + 1)
        },
      })
    } catch {
      setSystem({ webgl2: false })
      return
    }
    renderer.start()
    if (import.meta.env.DEV || location.search.includes('debug')) {
      ;(window as unknown as Record<string, unknown>).__AURORA_RENDERER__ = renderer
    }
    return () => renderer.dispose()
  }, [webgl2, generation, setSystem])

  return <div ref={ref} className="fixed inset-0 overflow-hidden bg-void" data-testid="visualizer" />
}
