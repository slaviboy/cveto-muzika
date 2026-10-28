import { beforeEach, describe, expect, it } from 'vitest'
import {
  assignChannel,
  CHANNEL_LAYOUTS,
  channelRange,
  createChannel,
  generateChannels,
  moveItem,
  nameForBand,
} from '../../src/state/channelOps'
import { createDefaultSettings } from '../../src/state/defaults'
import { MAX_CHANNELS } from '../../src/state/settingsSchema'
import { useAppStore } from '../../src/state/useAppStore'

describe('channel configuration', () => {
  it('generates any number of contiguous log bands', () => {
    for (const n of [1, 2, 3, 4, 6, 8, 12, 16, 10, 32]) {
      const chans = generateChannels(n, 20, 16000, 'log')
      expect(chans).toHaveLength(n)
      expect(chans[0].minHz).toBeCloseTo(20, 1)
      expect(chans[n - 1].maxHz).toBeCloseTo(16000, 0)
      for (let i = 1; i < n; i++) expect(chans[i].minHz).toBeCloseTo(chans[i - 1].maxHz, 0)
      expect(new Set(chans.map((c) => c.id)).size).toBe(n)
      expect(new Set(chans.map((c) => c.name)).size).toBe(n)
    }
    expect(generateChannels(500)).toHaveLength(MAX_CHANNELS)
  })

  it('ships the requested starting layouts', () => {
    expect(CHANNEL_LAYOUTS.rgb3.build().map((c) => c.color)).toEqual(['#ff2d4b', '#25ff7a', '#2f6bff'])
    expect(CHANNEL_LAYOUTS.spectrum6.build()).toHaveLength(6)
    expect(CHANNEL_LAYOUTS.rainbow8.build()).toHaveLength(8)
    const deep = CHANNEL_LAYOUTS.deepSpectrum.build()
    expect(deep.map((c) => [c.minHz, c.maxHz])).toEqual([
      [20, 80],
      [80, 250],
      [250, 1000],
      [1000, 4000],
      [4000, 12000],
    ])
  })

  it('resolves centre/bandwidth mode into a range', () => {
    const ch = createChannel({ rangeMode: 'center', centerHz: 1000, bandwidthOct: 2 })
    const [lo, hi] = channelRange(ch)
    expect(lo).toBeCloseTo(500)
    expect(hi).toBeCloseTo(2000)
    expect(channelRange(createChannel({ minHz: 900, maxHz: 100 }))).toEqual([100, 900])
  })

  it('derives supporting colors and independent settings per channel', () => {
    const ch = createChannel({ color: '#ff0000', delayMs: 120, sensitivity: 2 })
    expect(ch.secondaryColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(ch.gradientEnd).not.toBe(ch.color)
    expect(ch.delayMs).toBe(120)
    expect(ch.sensitivity).toBe(2)
  })

  it('assigns elements to channels in groups or cycles', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => assignChannel(i, 6, 3, 'grouped'))).toEqual([0, 0, 1, 1, 2, 2])
    expect([0, 1, 2, 3, 4, 5].map((i) => assignChannel(i, 6, 3, 'cycled'))).toEqual([0, 1, 2, 0, 1, 2])
  })

  it('names bands musically and moves items', () => {
    expect(nameForBand(20, 60)).toBe('Sub')
    expect(nameForBand(6000, 16000)).toBe('Air')
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })
})

describe('channel editing through the store', () => {
  beforeEach(() => {
    useAppStore.setState({ settings: createDefaultSettings(), activePresetId: 'aurora', presetDirty: false })
  })

  it('adds, duplicates, reorders, edits and removes channels', () => {
    const s = useAppStore.getState()
    const before = s.settings.channels.length
    s.addChannel()
    expect(useAppStore.getState().settings.channels).toHaveLength(before + 1)

    const first = useAppStore.getState().settings.channels[0]
    s.duplicateChannel(first.id)
    const afterDup = useAppStore.getState().settings.channels
    expect(afterDup[1].name).toBe(`${first.name} copy`)
    expect(afterDup[1].id).not.toBe(first.id)

    s.moveChannel(0, 2)
    expect(useAppStore.getState().settings.channels[2].id).toBe(first.id)

    s.updateChannel(first.id, (c) => {
      c.delayMs = 300
      c.color = '#123456'
      c.enabled = false
    })
    const edited = useAppStore.getState().settings.channels.find((c) => c.id === first.id)!
    expect(edited).toMatchObject({ delayMs: 300, color: '#123456', enabled: false })
    expect(useAppStore.getState().presetDirty).toBe(true)

    s.removeChannel(first.id)
    expect(useAppStore.getState().settings.channels.some((c) => c.id === first.id)).toBe(false)
  })

  it('never removes the last channel and caps the count', () => {
    const s = useAppStore.getState()
    s.generateChannelBands(1)
    const only = useAppStore.getState().settings.channels[0]
    s.removeChannel(only.id)
    expect(useAppStore.getState().settings.channels).toHaveLength(1)
    s.generateChannelBands(MAX_CHANNELS)
    s.addChannel()
    expect(useAppStore.getState().settings.channels).toHaveLength(MAX_CHANNELS)
  })

  it('resets a single section without touching others', () => {
    const s = useAppStore.getState()
    s.update((st) => {
      st.rings.count = 99
      st.effects.grain.enabled = true
    })
    s.resetSection('effects')
    const after = useAppStore.getState().settings
    expect(after.effects.grain.enabled).toBe(false)
    expect(after.rings.count).toBe(99)
  })
})
