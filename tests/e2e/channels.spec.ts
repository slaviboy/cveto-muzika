import { expect, open, openSection, store, test } from './fixtures'

test('creates and edits a frequency channel', async ({ page }) => {
  await open(page)
  await openSection(page, 'channels')
  const rows = page.getByTestId('channel-row')
  const before = await rows.count()
  await page.getByTestId('add-channel').click()
  await expect(rows).toHaveCount(before + 1)

  await rows.last().getByTestId('channel-row-toggle').click()
  const editor = page.getByTestId('channel-editor')
  await expect(editor).toBeVisible()
  await editor.getByTestId('channel-name-input').fill('Shimmer')
  await editor.getByTestId('channel-range-min').fill('7000')
  await editor.getByTestId('channel-range-min').press('Enter')
  await editor.getByTestId('channel-range-max').fill('11000')
  await editor.getByTestId('channel-range-max').press('Enter')

  await expect.poll(() => store(page, (s) => s.settings.channels.at(-1))).toMatchObject({ name: 'Shimmer', minHz: 7000, maxHz: 11000 })
  await expect(rows.last()).toContainText('Shimmer')
})

test('updates a channel color with a hex value', async ({ page }) => {
  await open(page)
  await openSection(page, 'channels')
  await page.getByTestId('channel-row').first().getByTestId('channel-row-toggle').click()
  await page.getByTestId('channel-color').click()
  const hex = page.getByTestId('color-hex-input')
  await hex.fill('#12ab34')
  await hex.press('Enter')
  await expect.poll(() => store(page, (s) => s.settings.channels[0].color)).toBe('#12ab34')
})

test('configures per-channel delay in the editor and the timing table', async ({ page }) => {
  await open(page)
  await openSection(page, 'channels')
  await page.getByTestId('channel-row').nth(1).getByTestId('channel-row-toggle').click()
  await page.getByTestId('channel-delay').fill('250')
  await page.getByTestId('channel-delay').press('Enter')
  await expect.poll(() => store(page, (s) => s.settings.channels[1].delayMs)).toBe(250)
  await expect(page.getByTestId('channel-row').nth(1)).toContainText('+250 ms')

  await openSection(page, 'timing')
  await page.getByTestId('delay-input-0').fill('120')
  await page.getByTestId('delay-input-0').press('Enter')
  await expect.poll(() => store(page, (s) => s.settings.channels.map((c: { delayMs: number }) => c.delayMs).slice(0, 2))).toEqual([120, 250])
})

test('splits the spectrum into a chosen number of channels', async ({ page }) => {
  await open(page)
  await openSection(page, 'channels')
  await page.getByTestId('bands-12').click()
  await expect(page.getByTestId('channel-row')).toHaveCount(12)
  await page.getByTestId('bands-3').click()
  await expect(page.getByTestId('channel-row')).toHaveCount(3)
})
