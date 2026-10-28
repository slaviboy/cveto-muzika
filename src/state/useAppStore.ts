import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { findBuiltinPreset } from '../presets/builtinPresets'
import { mergePresetIntoSettings, toPresetSettings, type UserPreset } from '../presets/presetIO'
import type { AudioState } from '../types/audio'
import { createId, isPlainObject } from '../utils/misc'
import { CHANNEL_LAYOUTS, createChannel, defaultChannels, duplicateChannel, generateChannels, moveItem, nextChannel, type ChannelLayoutId } from './channelOps'
import { createDefaultSettings, detectProfile, PERFORMANCE_PROFILES, performanceDefaults } from './defaults'
import { migrateSettings, SETTINGS_VERSION } from './migrations'
import { parseSettings } from './settingsIO'
import { MAX_CHANNELS, type ChannelConfig, type PerformanceProfile, type Settings, type VisualizationMode } from './settingsSchema'
import { createDebouncedStorage } from './storage'

export const SECTION_IDS = [
  'audio',
  'fft',
  'channels',
  'mode',
  'geometry',
  'colors',
  'timing',
  'brightness',
  'effects',
  'performance',
  'presets',
] as const
export type SectionId = (typeof SECTION_IDS)[number]

export interface Toast {
  id: string
  message: string
  tone: 'info' | 'success' | 'error'
}

export interface UiState {
  settingsOpen: boolean
  section: SectionId
  uiHidden: boolean
  editingChannelId: string | null
  floatingEditor: boolean
  shortcutsOpen: boolean
  /** True once audio has run this session; the start screen then shrinks to a compact bar. */
  startedOnce: boolean
}

export interface SystemState {
  webgl2: boolean | null
  contextLost: boolean
  reducedMotionSystem: boolean
}

export interface AppState {
  settings: Settings
  userPresets: UserPreset[]
  activePresetId: string | null
  presetDirty: boolean
  ui: UiState
  audio: AudioState
  system: SystemState
  toasts: Toast[]

  update: (recipe: (s: Settings) => void) => void
  updateChannel: (id: string, recipe: (ch: ChannelConfig) => void) => void
  updateAllChannels: (recipe: (ch: ChannelConfig, index: number) => void) => void
  addChannel: () => void
  removeChannel: (id: string) => void
  duplicateChannel: (id: string) => void
  moveChannel: (from: number, to: number) => void
  applyChannelLayout: (layout: ChannelLayoutId) => void
  generateChannelBands: (count: number) => void
  setMode: (mode: VisualizationMode) => void
  setPerformanceProfile: (profile: PerformanceProfile) => void
  resetSection: (section: SectionId) => void
  resetAll: () => void
  applyBuiltinPreset: (id: string) => void
  applySettings: (settings: Settings, presetId?: string | null) => void
  saveUserPreset: (name: string) => string
  overwriteUserPreset: (id: string) => void
  renameUserPreset: (id: string, name: string) => void
  deleteUserPreset: (id: string) => void
  applyUserPreset: (id: string) => void
  setUi: (patch: Partial<UiState>) => void
  setAudio: (patch: Partial<AudioState>) => void
  setSystem: (patch: Partial<SystemState>) => void
  toast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

export const settingsStorage = createDebouncedStorage(300)
export const STORAGE_KEY = 'aurora:state'

const defaultsFor = () => createDefaultSettings(detectProfile())

export const useAppStore = create<AppState>()(
  persist(
    immer((set, get) => {
      /** Applies a settings mutation and marks the active preset as modified. */
      const mutate = (recipe: (s: Settings) => void) =>
        set((state) => {
          recipe(state.settings)
          state.presetDirty = state.activePresetId !== null
        })

      return {
        settings: defaultsFor(),
        userPresets: [],
        activePresetId: 'aurora',
        presetDirty: false,
        ui: {
          settingsOpen: false,
          section: 'channels',
          uiHidden: false,
          editingChannelId: null,
          floatingEditor: false,
          shortcutsOpen: false,
          startedOnce: false,
        },
        audio: { status: 'idle', error: null, devices: [], activeDeviceLabel: '', sampleRate: 48000 },
        system: { webgl2: null, contextLost: false, reducedMotionSystem: false },
        toasts: [],

        update: mutate,

        updateChannel: (id, recipe) =>
          mutate((s) => {
            const ch = s.channels.find((c) => c.id === id)
            if (ch) recipe(ch)
          }),

        updateAllChannels: (recipe) => mutate((s) => s.channels.forEach(recipe)),

        addChannel: () =>
          mutate((s) => {
            if (s.channels.length >= MAX_CHANNELS) return
            s.channels.push(nextChannel(s.channels))
          }),

        removeChannel: (id) =>
          set((state) => {
            if (state.settings.channels.length <= 1) return
            state.settings.channels = state.settings.channels.filter((c) => c.id !== id)
            if (state.ui.editingChannelId === id) state.ui.editingChannelId = null
            state.presetDirty = state.activePresetId !== null
          }),

        duplicateChannel: (id) =>
          mutate((s) => {
            if (s.channels.length >= MAX_CHANNELS) return
            const index = s.channels.findIndex((c) => c.id === id)
            if (index >= 0) s.channels.splice(index + 1, 0, duplicateChannel(s.channels[index]))
          }),

        moveChannel: (from, to) =>
          mutate((s) => {
            s.channels = moveItem(s.channels, from, to)
          }),

        applyChannelLayout: (layout) =>
          mutate((s) => {
            s.channels = CHANNEL_LAYOUTS[layout].build()
          }),

        generateChannelBands: (count) =>
          mutate((s) => {
            s.channels = generateChannels(count, s.audio.minFrequency, s.audio.maxFrequency, s.audio.frequencyScale)
          }),

        setMode: (mode) =>
          set((state) => {
            state.settings.mode = mode
          }),

        setPerformanceProfile: (profile) =>
          set((state) => {
            const p = state.settings.performance
            if (profile === 'custom') {
              p.profile = 'custom'
              return
            }
            Object.assign(p, PERFORMANCE_PROFILES[profile], { profile })
          }),

        resetSection: (section) =>
          set((state) => {
            const s = state.settings
            const d = createDefaultSettings()
            const defCh = createChannel()
            switch (section) {
              case 'audio':
                Object.assign(s.audio, { gainDb: d.audio.gainDb, sensitivity: d.audio.sensitivity, demoMonitor: d.audio.demoMonitor, demoVolume: d.audio.demoVolume })
                break
              case 'fft': {
                const { deviceId, demoMonitor, demoVolume, gainDb, sensitivity } = s.audio
                s.audio = { ...d.audio, deviceId, demoMonitor, demoVolume, gainDb, sensitivity }
                break
              }
              case 'channels':
                s.channels = defaultChannels()
                break
              case 'mode':
                s.mode = d.mode
                s.bars.style = d.bars.style
                s.squares.layout = d.squares.layout
                s.leds.mapping = d.leds.mapping
                break
              case 'geometry':
                if (s.mode === 'rings') s.rings = d.rings
                if (s.mode === 'leds') s.leds = d.leds
                if (s.mode === 'bars') s.bars = d.bars
                if (s.mode === 'squares') s.squares = d.squares
                break
              case 'colors':
                s.color = d.color
                s.background = d.background
                break
              case 'timing':
                s.timing = d.timing
                s.audio.peakHoldMs = d.audio.peakHoldMs
                s.audio.peakDecay = d.audio.peakDecay
                for (const ch of s.channels) Object.assign(ch, { delayMs: defCh.delayMs, attackMs: defCh.attackMs, releaseMs: defCh.releaseMs })
                break
              case 'brightness':
                s.tone = d.tone
                for (const ch of s.channels)
                  Object.assign(ch, {
                    brightness: defCh.brightness,
                    contrast: defCh.contrast,
                    minIntensity: defCh.minIntensity,
                    maxIntensity: defCh.maxIntensity,
                    opacity: defCh.opacity,
                  })
                break
              case 'effects':
                s.effects = d.effects
                break
              case 'performance':
                s.performance = performanceDefaults(detectProfile())
                break
              case 'presets':
                break
            }
            state.presetDirty = state.activePresetId !== null
          }),

        resetAll: () =>
          set((state) => {
            const performance = state.settings.performance
            const deviceId = state.settings.audio.deviceId
            state.settings = createDefaultSettings()
            state.settings.performance = performance
            state.settings.audio.deviceId = deviceId
            state.activePresetId = 'aurora'
            state.presetDirty = false
          }),

        applyBuiltinPreset: (id) => {
          const preset = findBuiltinPreset(id)
          if (!preset) return
          const { settings } = mergePresetIntoSettings(get().settings, preset.build())
          get().applySettings(settings, preset.id)
        },

        applySettings: (settings, presetId = null) =>
          set((state) => {
            state.settings = settings
            state.activePresetId = presetId
            state.presetDirty = false
            if (state.ui.editingChannelId && !settings.channels.some((c) => c.id === state.ui.editingChannelId)) {
              state.ui.editingChannelId = null
            }
          }),

        saveUserPreset: (name) => {
          const id = createId('user')
          const now = new Date().toISOString()
          set((state) => {
            state.userPresets.unshift({
              id,
              name: name.trim().slice(0, 60) || 'Untitled preset',
              createdAt: now,
              updatedAt: now,
              settings: toPresetSettings(state.settings),
            })
            state.activePresetId = id
            state.presetDirty = false
          })
          return id
        },

        overwriteUserPreset: (id) =>
          set((state) => {
            const p = state.userPresets.find((u) => u.id === id)
            if (!p) return
            p.settings = toPresetSettings(state.settings)
            p.updatedAt = new Date().toISOString()
            state.activePresetId = id
            state.presetDirty = false
          }),

        renameUserPreset: (id, name) =>
          set((state) => {
            const p = state.userPresets.find((u) => u.id === id)
            if (p && name.trim()) p.name = name.trim().slice(0, 60)
          }),

        deleteUserPreset: (id) =>
          set((state) => {
            state.userPresets = state.userPresets.filter((u) => u.id !== id)
            if (state.activePresetId === id) state.activePresetId = null
          }),

        applyUserPreset: (id) => {
          const preset = get().userPresets.find((u) => u.id === id)
          if (!preset) return
          const { settings } = mergePresetIntoSettings(get().settings, preset.settings)
          get().applySettings(settings, id)
        },

        setUi: (patch) =>
          set((state) => {
            Object.assign(state.ui, patch)
          }),
        setAudio: (patch) =>
          set((state) => {
            Object.assign(state.audio, patch)
          }),
        setSystem: (patch) =>
          set((state) => {
            Object.assign(state.system, patch)
          }),

        toast: (message, tone = 'info') => {
          const id = createId('toast')
          set((state) => {
            state.toasts.push({ id, message, tone })
            if (state.toasts.length > 4) state.toasts.shift()
          })
          setTimeout(() => get().dismissToast(id), tone === 'error' ? 6500 : 3200)
        },
        dismissToast: (id) =>
          set((state) => {
            state.toasts = state.toasts.filter((t) => t.id !== id)
          }),
      }
    }),
    {
      name: STORAGE_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => settingsStorage),
      partialize: (state) => ({
        settings: state.settings,
        userPresets: state.userPresets,
        activePresetId: state.activePresetId,
        presetDirty: state.presetDirty,
      }),
      migrate: (persisted, version) => {
        const state = isPlainObject(persisted) ? { ...persisted } : {}
        state.settings = migrateSettings(state.settings, version).settings
        if (Array.isArray(state.userPresets)) {
          state.userPresets = state.userPresets.map((p: unknown) =>
            isPlainObject(p) ? { ...p, settings: migrateSettings(p.settings, version).settings } : p,
          )
        }
        return state
      },
      merge: (persisted, current) => mergePersisted(persisted, current),
    },
  ),
)

/** Validates whatever came out of storage; corrupt data falls back to defaults field by field. */
export function mergePersisted(persisted: unknown, current: AppState): AppState {
  if (!isPlainObject(persisted)) return current
  const settings = isPlainObject(persisted.settings) ? parseSettings(persisted.settings).settings : current.settings
  const userPresets = Array.isArray(persisted.userPresets)
    ? persisted.userPresets.filter(
        (p): p is UserPreset =>
          isPlainObject(p) && typeof p.id === 'string' && typeof p.name === 'string' && isPlainObject(p.settings),
      )
    : []
  const activePresetId = typeof persisted.activePresetId === 'string' ? persisted.activePresetId : null
  return {
    ...current,
    settings,
    userPresets,
    activePresetId,
    presetDirty: persisted.presetDirty === true,
  }
}

/** Non-reactive accessor for the render loop. */
export const getSettings = () => useAppStore.getState().settings

export function channelIndexById(settings: Settings, id: string): number {
  return settings.channels.findIndex((c) => c.id === id)
}
