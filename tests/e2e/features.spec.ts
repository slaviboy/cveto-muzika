import { expect, open, openSection, store, test } from './fixtures'

test('switches the interface to Bulgarian and back', async ({ page }) => {
  await open(page)
  await expect(page.getByTestId('start-mic').first()).toHaveText(/Start microphone/)
  await page.getByTestId('locale-bg').click()
  await expect(page.getByTestId('start-mic').first()).toHaveText(/Включи микрофона/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'bg')
  // Generated channel names follow the language.
  await expect.poll(() => store(page, (s) => s.settings.channels[1].name)).toBe('Бас')

  await openSection(page, 'channels')
  await expect(page.getByTestId('section-title')).toHaveText('Честотни канали')
  await page.getByTestId('language-toggle').click()
  await expect(page.getByTestId('section-title')).toHaveText('Frequency channels')
  await expect.poll(() => store(page, (s) => s.settings.channels[1].name)).toBe('Bass')
})

test('resets a single control and a whole section to defaults', async ({ page }) => {
  await open(page)
  await openSection(page, 'geometry')
  const input = page.getByTestId('ring-count')
  await input.fill('77')
  await input.press('Enter')
  await expect.poll(() => store(page, (s) => s.settings.rings.count)).toBe(77)

  await page.getByRole('button', { name: 'Reset Rings to default' }).click()
  await expect.poll(() => store(page, (s) => s.settings.rings.count)).toBe(24)

  await input.fill('90')
  await input.press('Enter')
  await page.getByTestId('section-reset').click()
  await expect.poll(() => store(page, (s) => s.settings.rings.count)).toBe(24)
})

test('draws touching and merged ring styles', async ({ page }) => {
  await open(page)
  await page.getByTestId('start-demo').first().click()
  await openSection(page, 'mode')
  for (const style of ['touching', 'merged', 'lines']) {
    await page.getByTestId(`ring-style-${style}`).click()
    await expect.poll(() => store(page, (s) => s.settings.rings.style)).toBe(style)
  }
})

test('shows LED bars across the screen', async ({ page }) => {
  await open(page)
  await page.getByTestId('mode-bars').click()
  await openSection(page, 'mode')
  await page.getByTestId('bars-style-leds').click()
  await expect.poll(() => store(page, (s) => s.settings.bars.style)).toBe('leds')
  await expect.poll(() => page.evaluate(() => (window as any).__AURORA_RENDERER__.activeMode)).toBe('bars')
})

test('starts with a static background and lets background visuals be switched on', async ({ page }) => {
  await open(page)
  expect(await store(page, (s) => [s.settings.effects.particles.enabled, s.settings.background.reactivity, s.settings.leds.rotationSpeed])).toEqual([false, 0, 0])
  await openSection(page, 'colors')
  await page.getByTestId('background-visuals').click()
  await expect.poll(() => store(page, (s) => s.settings.effects.particles.enabled)).toBe(true)
})
