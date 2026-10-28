import { expect, open, store, test } from './fixtures'

test('mobile settings sheet is usable by touch', async ({ page }) => {
  await open(page)
  await page.getByTestId('start-demo').first().tap()
  await expect(page.getByTestId('audio-status')).toHaveAttribute('data-status', 'demo')

  // The toolbar fits the screen: the settings button is fully visible.
  const viewport = page.viewportSize()!
  const box = (await page.getByTestId('settings-toggle').boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)

  await page.getByTestId('settings-toggle').tap()
  const sheet = page.getByTestId('settings-sheet')
  await expect(sheet).toBeVisible()

  await sheet.getByTestId('section-geometry').tap()
  await expect(sheet.getByTestId('section-title')).toHaveText('Geometry')
  const before = await store(page, (s) => s.settings.rings.count)
  const slider = sheet.getByRole('slider', { name: 'Rings' })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => store(page, (s) => s.settings.rings.count)).toBe(before + 2)

  await sheet.getByTestId('ring-count').fill('40')
  await sheet.getByTestId('ring-count').press('Enter')
  await expect.poll(() => store(page, (s) => s.settings.rings.count)).toBe(40)

  await sheet.getByTestId('section-mode').tap()
  await sheet.getByTestId('mode-card-bars').tap()
  await expect.poll(() => store(page, (s) => s.settings.mode)).toBe('bars')

  await sheet.getByRole('button', { name: 'Close settings' }).tap()
  await expect(sheet).toBeHidden()
})
