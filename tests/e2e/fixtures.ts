import { expect, test as base, type Page } from '@playwright/test'

/** Every test fails if the page logs an error or throws. */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`)
      })
      await use(errors)
      expect(errors, 'unexpected browser errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

type Debug = {
  getState: () => {
    settings: Record<string, any>
    audio: { status: string }
    userPresets: { name: string }[]
    activePresetId: string | null
  }
  getFrame: () => { active: boolean; overall: number; spectrum: Float32Array; intensity: Float32Array } | null
}

export async function open(page: Page) {
  await page.goto('/?debug')
  await expect(page.getByTestId('visualizer')).toBeVisible()
}

/** Reads a value from the app store through the debug hook. */
export function store<T>(page: Page, pick: (s: ReturnType<Debug['getState']>) => T): Promise<T> {
  return page.evaluate(`(${pick.toString()})(window.__AURORA_DEBUG__.getState())`) as Promise<T>
}

export function frameStat(page: Page, expr: string): Promise<number> {
  return page.evaluate(`(() => { const f = window.__AURORA_DEBUG__.getFrame(); return f ? (${expr}) : -1 })()`) as Promise<number>
}

export async function openSection(page: Page, section: string) {
  if (!(await page.getByTestId('settings-panel').or(page.getByTestId('settings-sheet')).isVisible())) {
    await page.getByTestId('settings-toggle').click()
  }
  await page.getByTestId(`section-${section}`).click()
}
