import { test, expect } from '@playwright/test'
import { mockAccount } from './fixtures/cloud'

test('compact header keeps round flow and exits available, with keyboard-accessible confirmed actions', async ({ page }, testInfo) => {
  const { workout, requests } = await mockAccount(page, 'coach', true, { active: true })
  await page.goto(`/#/workout/${workout.id}`)
  await page.getByRole('button', { name: 'Λειτουργία προπόνησης', exact: true }).click()
  const header = page.getByTestId('round-header'), options = header.getByRole('button', { name: 'Επιλογές προπόνησης', exact: true })
  await expect(header.getByText('Σταθμός Α', { exact: true })).toBeVisible()
  await expect(header.getByRole('heading', { name: 'Γύρος 1 / 3', exact: true })).toBeVisible()
  await expect(header.getByRole('list', { name: 'Ροή γύρου' })).toBeVisible()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await options.focus(); await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Ολοκλήρωση', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Διακοπή', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0); await expect(options).toBeFocused()
  await options.click(); await page.getByRole('menuitem', { name: 'Ολοκλήρωση', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Ολοκλήρωση προπόνησης', exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Συνέχεια προπόνησης', exact: true }).click()
  await options.click(); await page.getByRole('menuitem', { name: 'Διακοπή', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Διακοπή χωρίς αποθήκευση', exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Ακύρωση', exact: true }).click()
  await options.click(); await header.getByRole('heading').click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  const station = (await header.getByText('Σταθμός Α', { exact: true }).boundingBox())!, round = (await header.getByRole('heading').boundingBox())!
  if (page.viewportSize()!.width >= 680) expect(Math.abs(station.y - round.y)).toBeLessThan(10)
  await page.screenshot({ path: testInfo.outputPath('compact-header.png') })
  await page.getByRole('button', { name: 'Έξοδος από λειτουργία προπόνησης', exact: true }).click()
  await expect(page.locator('.topbar')).toBeVisible()
  expect(requests.filter(r => r.endpoint === 'save_record' || r.endpoint === 'delete_record')).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('compact panels align actual inputs despite wrapped exercise titles and keep targets distinct', async ({ page }, testInfo) => {
  const name = 'Goblet Squats with a deliberately longer exercise title'
  const { workout } = await mockAccount(page, 'coach', true, { active: true, configureWorkout: w => {
    w.results = {}; w.routine.stations[0].slots[0].movements[0].name = name
  } })
  await page.goto(`/#/workout/${workout.id}`)
  await page.getByRole('button', { name: 'Λειτουργία προπόνησης', exact: true }).click()
  const anna = page.getByTestId('panel-anna'), dimitra = page.getByTestId('panel-dimitra')
  await expect(anna.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(anna.getByLabel(`Στόχος Άννα ${name}`, { exact: true })).toHaveText('10–12 επ.')
  await expect(dimitra.getByLabel('Στόχος Δήμητρα TRX Rows', { exact: true })).toHaveText('10–12 επ.')
  await expect(page.locator('.prescribed-target')).toHaveCount(0)
  await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('')
  await expect(dimitra.getByLabel(/^Επαναλήψεις/)).toHaveValue('')
  if (page.viewportSize()!.width >= 680) {
    const a = (await anna.getByLabel(/^Επαναλήψεις/).boundingBox())!, d = (await dimitra.getByLabel(/^Επαναλήψεις/).boundingBox())!
    expect(Math.abs(a.y - d.y)).toBeLessThan(2)
    expect(a.height).toBeGreaterThanOrEqual(65); expect(d.height).toBeGreaterThanOrEqual(65)
  }
  await page.screenshot({ path: testInfo.outputPath('compact-panels.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('compact panels retain both TRX movements during combined recording and swap', async ({ page }) => {
  const { workout } = await mockAccount(page, 'coach', true, { active: true, routine: 1, configureWorkout: w => { w.stationIndex = 2; w.results = {} } })
  await page.goto(`/#/workout/${workout.id}`)
  const dimitra = page.getByTestId('panel-dimitra')
  await expect(dimitra.getByRole('heading', { name: 'TRX Biceps Curls', exact: true })).toBeVisible()
  await expect(dimitra.getByRole('heading', { name: 'TRX Triceps Extensions', exact: true })).toBeVisible()
  const anna = page.getByTestId('panel-anna')
  await anna.getByLabel(/^Βάρος/).fill('5'); await anna.getByLabel(/^Επαναλήψεις/).fill('10')
  for (const input of await dimitra.getByLabel(/^Επαναλήψεις/).all()) await input.fill('11')
  await page.getByRole('button', { name: 'Καταγραφή και αλλαγή', exact: true }).click()
  await expect(anna.getByRole('heading', { name: 'TRX Biceps Curls', exact: true })).toBeVisible()
  await expect(anna.getByRole('heading', { name: 'TRX Triceps Extensions', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('compact panel alternatives remain selectable and targets remain in seconds', async ({ page }) => {
  const { workout } = await mockAccount(page, 'coach', true, { active: true, routine: 1, configureWorkout: w => { w.stationIndex = 3; w.results = {} } })
  await page.goto(`/#/workout/${workout.id}`)
  await page.getByRole('button', { name: 'Λειτουργία προπόνησης', exact: true }).click()
  const anna = page.getByTestId('panel-anna'), dimitra = page.getByTestId('panel-dimitra')
  await dimitra.getByLabel('Επιλογή άσκησης').selectOption({ label: 'Plank Hip Dips' })
  await expect(dimitra.getByRole('heading', { name: 'Plank Hip Dips', exact: true })).toBeVisible()
  await expect(dimitra.getByLabel('Στόχος Δήμητρα Plank Hip Dips', { exact: true })).toHaveText('40 δευτ.')
  if (page.viewportSize()!.width >= 680) {
    const a = (await anna.getByLabel(/^Διάρκεια/).boundingBox())!, d = (await dimitra.getByLabel(/^Διάρκεια/).boundingBox())!
    expect(Math.abs(a.y - d.y)).toBeLessThan(2)
  }
  await anna.getByLabel(/^Βάρος/).fill('5'); await anna.getByLabel(/^Διάρκεια/).fill('40'); await dimitra.getByLabel(/^Διάρκεια/).fill('40')
  await page.getByRole('button', { name: 'Καταγραφή και αλλαγή', exact: true }).click()
  await page.getByRole('button', { name: 'Πίσω', exact: true }).click()
  await expect(dimitra.getByLabel('Επιλογή άσκησης')).toBeDisabled()
  await expect(dimitra.getByRole('heading', { name: 'Plank Hip Dips', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
