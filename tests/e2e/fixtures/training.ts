import { expect, type Page, type Locator } from '@playwright/test'

export async function enterValue(page: Page, panel: Locator, field: 'Βάρος' | 'Επαναλήψεις' | 'Διάρκεια', value: string) {
  await expect(panel).toBeVisible()
  const input = panel.getByLabel(new RegExp(`^${field}`))
  if (await input.count()) await input.fill(value)
  else {
    await panel.getByRole('button', { name: new RegExp(`^Επεξεργασία ${field.toLowerCase()} `) }).click()
    const editor = page.getByRole('dialog')
    await editor.getByLabel(new RegExp(`^${field}`)).fill(value)
    await editor.getByRole('button', { name: 'Έτοιμο', exact: true }).click()
  }
}

export async function normalPreview(page: Page) {
  await page.addInitScript(() => {
    const key = 'wl-training-fit:local:local'
    if (localStorage.getItem(key) === null) localStorage.setItem(key, 'no')
  })
}
