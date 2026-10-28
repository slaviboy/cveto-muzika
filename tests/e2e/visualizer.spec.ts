import { expect, frameStat, open, store, test } from './fixtures'

test('starts and stops the microphone', async ({ page }) => {
  await open(page)
  await expect(page.getByTestId('audio-status')).toHaveAttribute('data-status', 'idle')
  await page.getByTestId('start-mic').first().click()
  await expect(page.getByTestId('audio-status')).toHaveAttribute('data-status', 'live')
  await expect.poll(() => frameStat(page, 'f.active ? 1 : 0')).toBe(1)
  // The (fake) capture device produces real samples that reach the FFT.
  await expect.poll(() => frameStat(page, 'Math.max(...f.spectrum)'), { timeout: 15_000 }).toBeGreaterThan(0)

  await page.getByTestId('audio-status').click()
  await expect(page.getByTestId('audio-status')).toHaveAttribute('data-status', 'idle')
  await expect.poll(() => frameStat(page, 'f.active ? 1 : 0')).toBe(0)
  await expect(page.getByText('Paused')).toBeVisible()
})

test('demo mode drives every channel from FFT data', async ({ page }) => {
  await open(page)
  await page.getByTestId('start-demo').first().click()
  await expect(page.getByTestId('audio-status')).toHaveAttribute('data-status', 'demo')
  await expect.poll(() => frameStat(page, 'f.overall'), { timeout: 15_000 }).toBeGreaterThan(0.05)
  await expect.poll(() => frameStat(page, 'Array.from(f.intensity).filter((v) => v > 0.01).length'), { timeout: 15_000 }).toBeGreaterThanOrEqual(3)
})

test('switches between all visualization modes', async ({ page }) => {
  await open(page)
  await page.getByTestId('start-demo').first().click()
  for (const mode of ['leds', 'bars', 'squares', 'rings']) {
    await page.getByTestId(`mode-${mode}`).click()
    await expect(page.getByTestId(`mode-${mode}`)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => page.evaluate(() => (window as any).__AURORA_RENDERER__.activeMode)).toBe(mode)
  }
  // Keyboard shortcuts switch modes too.
  await page.keyboard.press('3')
  await expect.poll(() => store(page, (s) => s.settings.mode)).toBe('bars')
})

test('shows the keyboard shortcuts dialog', async ({ page }) => {
  await open(page)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden()
})
