# Aurora

A real-time music visualizer for the browser. Aurora listens to the microphone (or a built-in synthesized demo track), analyzes the spectrum with the Web Audio API and turns every frequency band into light: concentric rings, LED rings, light bars and square grids, rendered with custom WebGL2 shaders through Three.js.

Audio is analyzed locally. Nothing is recorded, stored or uploaded.

## Running it

Requires Node 20+ (developed on Node 26) and a browser with WebGL2.

```bash
npm install
npm run dev          # http://localhost:5173
```

Browsers only allow the microphone on `localhost` or HTTPS. To try it on a phone on the same network:

```bash
npm run dev:https    # serves on the LAN with a self-signed certificate; accept the warning once
```

Production build:

```bash
npm run build        # type-checks, then bundles to dist/
npm run preview      # serves dist/ on http://localhost:4173
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `dev:https` | Vite dev server (HTTP / LAN HTTPS) |
| `npm run build` | `tsc -b` + production bundle |
| `npm run typecheck` | TypeScript project build, no emit |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end tests (desktop Chromium + Pixel 7 emulation) |
| `npm run test:all` | All of the above in order |

The first e2e run needs `npx playwright install chromium`. The tests build the app and serve it on port 4173. They use Chromium's fake capture device, which produces real audio samples, and SwiftShader for WebGL in headless mode. Expect low frame rates there; that is the software renderer, not the app.

## Keyboard

`Space` starts or stops the microphone, `D` plays the demo, `1`–`4` switch modes, `S` toggles settings, `F` toggles fullscreen, `H` hides the interface, `?` lists the shortcuts.

## How it works

```
Microphone / demo synth
  → AnalyserNode (getFloatFrequencyData, reused buffers)
  → FrequencyAnalyzer: dB → linear power, spectral tilt, optional median filter, adaptive noise floor
  → FrequencyMapper: precomputed bin weights per band → mean band power (energy across a range)
                     + strongest interpolated peak inside each band (a single tone)
  → AudioPipeline, per channel: normalize to the dB range → sensitivity / gain / auto gain
                     → threshold (optionally adaptive) → response curve → attack/release envelope
                     → timestamped DelayedSignalBuffer (true delay, interpolated reads)
                     → min/max intensity, contrast, brightness
  → Visualization (instanced geometry + per-frame dynamic attributes)
  → EffectsPipeline: HDR target → trails/feedback → mip-chain bloom → composite
                     (distortions, shockwaves, chromatic aberration, background, tone mapping,
                     vignette, grain, dithering)
```

- **One render loop.** `rendering/Renderer.ts` owns the only `requestAnimationFrame` loop. Settings are read with `useAppStore.getState()`. Live values (levels, FPS) go to a mutable `liveData` bus that small UI meters read through refs, so audio never triggers React renders.
- **Smoothing is not delay.** Attack/release envelopes smooth the signal. The per-channel delay is a separate timestamped ring buffer that replays each channel's processed values later, independent of frame rate.
- **Bands are not peaks.** A channel's level is the mean power across its range. The "strongest tone" readout is the dominant FFT peak, refined with parabolic interpolation.
- **Channels drive everything.** Every visual element maps to a (channel, sub-band) pair. Rings, LEDs, bars and cells therefore all respect each channel's sensitivity, curve, timing and colors, whether there is 1 channel or 32.
- **Color** is handled in OKLab/OKLCh (`color/colorMath.ts`). The frequency → color map places each channel's color at its log-center frequency and crossfades between neighbors, or uses a custom multi-stop palette or a perceptual rainbow. It is baked into a half-float LUT for the shaders. Shaders mix colors in OKLab, and the final pass dithers to avoid banding.
- **Blend modes** use premultiplied alpha, so additive, soft and normal elements share one draw call.
- **Settings** are defined once as Zod schemas (`state/settingsSchema.ts`), and the TypeScript types are inferred from them. Persisted data and imported presets are validated: out-of-range numbers are clamped, invalid fields fall back to defaults, and every repair is reported. Storage writes are debounced and versioned through `state/migrations.ts`.
- **Performance profiles** (Quality, Balanced, Performance) set the pixel-ratio cap, MSAA, bloom levels and resolution, particle budget and geometry detail. Adaptive resolution lowers the render scale when frames run over budget. Reduced motion follows the OS setting unless overridden.

### Layout

```
src/
  app/            App shell, engine singletons, keyboard shortcuts
  audio/          AudioEngine, DemoSynth, FrequencyAnalyzer, FrequencyMapper, AudioPipeline,
                  TemporalSmoother, DelayedSignalBuffer, BeatDetector, AutoGain, SpectralPeaks
  color/          Color math (HEX/RGB/HSL/HSV/OKLab/OKLCh) and gradients
  components/     ui/ primitives, audio/ start screen and meters, settings/ panel + 11 sections,
                  visualizer/ canvas host, toolbar, overlays
  hooks/          live-frame reader, fullscreen, idle hide, wake lock, media queries
  presets/        Built-in presets and preset file import/export
  rendering/      Renderer, PerformanceMonitor, shader materials, GLSL
  state/          Zod schema, defaults, Zustand store, persistence, migrations, channel operations
  visualization/  Rings, LED rings, bars, squares, particles, center orb, color engine,
                  effects pipeline, visualization manager, Canvas 2D fallback
tests/unit        Vitest
tests/e2e         Playwright
```

## Presets

Built-in looks: Aurora, Three-band RGB, Six-band spectrum, Eight-band rainbow, Deep/warm/bright, Deep spectrum (20–80 / 80–250 / 250–1000 / 1000–4000 / 4000–12000 Hz), LED installation, Light wall, Neon equalizer, Square pulse, Square waves, Kaleidoscope, Tunnel.

Preset files are JSON:

```json
{ "format": "aurora-preset", "formatVersion": 1, "settingsVersion": 1, "name": "…", "createdAt": "…", "settings": { … } }
```

They contain the look only. Device-specific settings (performance profile, selected microphone, demo volume) are left out on export and kept on import.

## Known limitations

- **iPhone Safari** has no element fullscreen API, so the fullscreen button is hidden there. Use "Add to Home Screen" (the app ships a web manifest).
- Aurora requests unprocessed audio (no echo cancellation, noise suppression or AGC). Some platforms, notably iOS, may apply processing anyway.
- Analysis runs once per display frame on the main thread through `AnalyserNode`, which applies its own Blackman window. There is no AudioWorklet path.
- The Canvas 2D fallback for browsers without WebGL2 draws simplified rings and bars only.
- Up to 32 channels. Per-channel delays go up to 3 s, plus up to 1 s of global sync offset.
- After a WebGL context loss the renderer is rebuilt, which shows a brief notice.
- The settings schema is at version 1. The migration pipeline exists and is tested, but no migrations have been needed yet.
- The main bundle is about 750 kB (230 kB gzipped). Three.js is split into its own chunk; the settings UI is not lazy-loaded yet.
