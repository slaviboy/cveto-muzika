import { readFile } from 'node:fs/promises'
import { expect, open, openSection, store, test } from './fixtures'

test('exports the current look and imports it back', async ({ page }, testInfo) => {
  await open(page)
  await page.getByTestId('mode-squares').click()
  await openSection(page, 'presets')
  await page.getByTestId('preset-name-input').fill('Square study')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-current').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('square-study.aurora.json')
  const file = testInfo.outputPath('preset.json')
  await download.saveAs(file)
  const json = JSON.parse(await readFile(file, 'utf8'))
  expect(json).toMatchObject({ format: 'aurora-preset', name: 'Square study', settings: { mode: 'squares' } })
  expect(json.settings.performance).toBeUndefined()

  // Change the look, then restore it from the file.
  await page.getByTestId('mode-rings').click()
  await expect.poll(() => store(page, (s) => s.settings.mode)).toBe('rings')
  await page.getByTestId('import-file-input').setInputFiles(file)
  await expect.poll(() => store(page, (s) => s.settings.mode)).toBe('squares')
  await expect(page.getByText('Imported “Square study”')).toBeVisible()
  await expect(page.getByTestId('user-preset')).toHaveCount(1)
})

test('rejects an invalid preset file with a clear message', async ({ page }) => {
  await open(page)
  await openSection(page, 'presets')
  await page.getByTestId('import-file-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ nope') })
  await expect(page.getByText('This file is not valid JSON.')).toBeVisible()
})

test('saves presets and keeps settings across reloads', async ({ page }) => {
  await open(page)
  await page.getByTestId('mode-leds').click()
  await openSection(page, 'presets')
  await page.getByTestId('preset-name-input').fill('Night LEDs')
  await page.getByTestId('save-preset').click()
  await expect(page.getByTestId('user-preset')).toContainText('Night LEDs')

  // Persistence is debounced; give it a moment, then reload.
  await page.waitForTimeout(600)
  await page.reload()
  await expect.poll(() => store(page, (s) => s.settings.mode)).toBe('leds')
  await expect.poll(() => store(page, (s) => s.userPresets.map((p) => p.name))).toEqual(['Night LEDs'])
})

test('applies built-in presets', async ({ page }) => {
  await open(page)
  await openSection(page, 'presets')
  await page.getByTestId('builtin-light-wall').click()
  await expect.poll(() => store(page, (s) => [s.settings.mode, s.settings.bars.style])).toEqual(['bars', 'lightwall'])
  await page.getByTestId('builtin-rgb3').click()
  await expect.poll(() => store(page, (s) => s.settings.channels.length)).toBe(3)
})
