import { test, expect, type Page } from '@playwright/test'
import { mockAccount, synchronize } from './fixtures/cloud'
import { enterValue as enter } from './fixtures/training'
import { requiredResults } from '../../src/lib/model'
async function fits(page: Page) {
  await expect(page.getByTestId('round-header')).toBeVisible()
  await expect(page.getByTestId('workout-controls')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  const header = (await page.getByTestId('round-header').boundingBox())!, footer = (await page.getByTestId('workout-controls').boundingBox())!
  for (const athlete of ['anna', 'dimitra']) {
    const panel = page.getByTestId(`panel-${athlete}`), box = (await panel.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(header.y + header.height)
    expect(box.y + box.height).toBeLessThanOrEqual(footer.y)
    expect(await panel.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    for (const control of await panel.getByRole('button').all()) {
      const bounds = await control.boundingBox(); if (!bounds) continue
      expect(bounds.height).toBeGreaterThanOrEqual(44)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(footer.y + 1)
    }
  }
  const values = ['anna', 'dimitra'].map(athlete => page.getByTestId(`panel-${athlete}`).locator('.fit-values').first())
  if (await values[0].count() && await values[1].count()) {
    const a = (await values[0].boundingBox())!, d = (await values[1].boundingBox())!
    expect(Math.abs(a.y - d.y)).toBeLessThan(2)
  }
  expect(footer.y + footer.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
}

test('training defaults to one screen, logs both athletes, swaps, and starts rest only manually', async ({ page }, info) => {
  const { workout } = await mockAccount(page, 'coach', true, { fit: true, active: true, configureWorkout: w => { w.results = {} } })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna'), dimitra = page.getByTestId('panel-dimitra')
  await expect(page.getByRole('button', { name: 'Έξοδος από λειτουργία προπόνησης', exact: true })).toBeVisible()
  await fits(page)
  await enter(page, anna, 'Βάρος', '6.25'); await enter(page, anna, 'Επαναλήψεις', '11'); await enter(page, dimitra, 'Επαναλήψεις', '12')
  await page.getByRole('button', { name: 'Καταγραφή και αλλαγή', exact: true }).click()
  await expect(anna.getByRole('heading', { name: 'TRX Rows', exact: true })).toBeVisible()
  await enter(page, anna, 'Επαναλήψεις', '10'); await enter(page, dimitra, 'Βάρος', '7.5'); await enter(page, dimitra, 'Επαναλήψεις', '9')
  await page.getByRole('button', { name: 'Καταγραφή και των δύο', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await fits(page)
  await page.screenshot({ path: info.outputPath('one-screen.png') })
  await page.getByRole('button', { name: 'Έναρξη διαλείμματος', exact: true }).click()
  const rest = page.getByRole('dialog', { name: 'Διάλειμμα προπόνησης', exact: true })
  await rest.getByRole('button', { name: 'Συνέχεια', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Γύρος 2 / 3', exact: true })).toBeVisible()
  await anna.getByRole('button', { name: 'Ίδιο με πριν', exact: true }).click()
  await fits(page)
})

test('field and increment selection changes only the intended value, remembers steps, and enforces limits', async ({ page }) => {
  const { workout, requests } = await mockAccount(page, 'coach', true, { fit: true, active: true, configureWorkout: w => { w.results = {} } })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna'), dimitra = page.getByTestId('panel-dimitra')
  await fits(page)
  const short = page.viewportSize()!.height < 520, compact = page.viewportSize()!.width < 680
  if (short) await anna.getByRole('button', { name: /^Επεξεργασία βάρος / }).click()
  const root = short ? page.getByRole('dialog') : anna
  const choose = async (field: 'weight' | 'value', step: string) => {
    if (compact && !short) await root.getByRole('combobox').selectOption(`${field}:${step}`)
    else await root.getByRole('combobox', { name: field === 'weight' ? /^Βήμα βάρους/ : /^Βήμα επαναλήψεων/ }).selectOption(step)
  }
  await choose('weight', '2.5'); await choose('value', '5')
  expect(requests).toHaveLength(0)
  await root.getByRole('button', { name: /^Αύξηση 5 επαναλήψεων/ }).click({ clickCount: 2 })
  await choose('weight', '2.5')
  await root.getByRole('button', { name: /^Αύξηση 2.5 kg/ }).click()
  if (short) await root.getByRole('button', { name: 'Έτοιμο', exact: true }).click()
  await page.reload(); await fits(page)
  if (short || compact) await anna.getByRole('button', { name: /^Επεξεργασία βάρος / }).click()
  const editor = short || compact ? page.getByRole('dialog') : anna
  await expect(editor.getByLabel(/^Βάρος/)).toHaveValue('2.5')
  await expect(editor.getByLabel(/^Επαναλήψεις/)).toHaveValue('10')
  await expect(editor.getByRole('combobox', { name: /^Βήμα βάρους/ })).toHaveValue('2.5')
  await expect(editor.getByRole('combobox', { name: /^Βήμα επαναλήψεων/ })).toHaveValue('5')
  await editor.getByLabel(/^Βάρος/).fill('500')
  await expect(editor.getByRole('button', { name: /^Αύξηση 2.5 kg/ })).toBeDisabled()
  await editor.getByLabel(/^Επαναλήψεις/).fill('1')
  await expect(editor.getByRole('button', { name: /^Μείωση 5 επαναλήψεων/ })).toBeDisabled()
  if (short || compact) await editor.getByRole('button', { name: 'Έτοιμο', exact: true }).click()
  if (short || compact) await dimitra.getByRole('button', { name: /^Επεξεργασία επαναλήψεις / }).click()
  await expect((short || compact ? page.getByRole('dialog') : dimitra).getByLabel(/^Επαναλήψεις/)).toHaveValue('')
  if (short || compact) await page.getByRole('dialog').getByRole('button', { name: 'Έτοιμο', exact: true }).click()
  await expect(anna.getByText('Έγινε', { exact: true })).toHaveCount(0)
})

test('long exercise names and timed alternatives remain usable without scrolling', async ({ page }, info) => {
  const { workout } = await mockAccount(page, 'coach', true, { fit: true, active: true, routine: 1, configureWorkout: w => {
    w.results = {}; w.stationIndex = 3; w.routine.stations[3].slots[0].movements[0].name = 'Dumbbell Swings with a deliberately longer exercise title'
  } })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna'), dimitra = page.getByTestId('panel-dimitra')
  await fits(page)
  await dimitra.getByRole('combobox', { name: /^Επιλογή άσκησης/ }).selectOption({ label: 'Plank Hip Dips' })
  await expect(dimitra.getByRole('heading', { name: 'Plank Hip Dips', exact: true })).toBeVisible()
  await enter(page, anna, 'Βάρος', '6.25'); await enter(page, anna, 'Διάρκεια', '40'); await enter(page, dimitra, 'Διάρκεια', '35')
  await fits(page)
  await page.getByRole('button', { name: 'Καταγραφή και αλλαγή', exact: true }).click()
  await page.getByRole('button', { name: 'Πίσω', exact: true }).click()
  await expect(dimitra.getByRole('combobox', { name: /^Επιλογή άσκησης/ })).toBeDisabled()
  await fits(page)
  await page.screenshot({ path: info.outputPath('timed-alternative.png') })
})

test('an absent athlete and final-round controls fit, and finishing restores navigation', async ({ page }) => {
  const { workout } = await mockAccount(page, 'coach', true, { fit: true, active: true, configureWorkout: w => {
    w.results = {}; w.participants = ['anna']; w.stationIndex = 3; w.roundIndex = 1
    for (const r of requiredResults(w, true)) w.results[r.key] = { ...r, status: 'completed', weight: 5, value: 15 }
    w.phase = 1
  } })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna')
  await expect(page.getByTestId('panel-dimitra').getByRole('heading', { name: 'Απούσα', exact: true })).toBeVisible()
  await fits(page)
  await enter(page, anna, 'Διάρκεια', '45')
  await anna.getByRole('button', { name: 'Καταγραφή', exact: true }).click()
  await fits(page)
  await page.getByRole('button', { name: 'Ολοκλήρωση', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Αποθήκευση & τέλος', exact: true }).click()
  await expect(page.locator('.topbar')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('45 δευτ.')
})

test('both TRX movements remain required, fit short screens, and preserve skipped and completed entries', async ({ page }) => {
  const { workout, remote } = await mockAccount(page, 'coach', true, { fit: true, active: true, routine: 1, configureWorkout: w => { w.results = {}; w.stationIndex = 2 } })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna'), dimitra = page.getByTestId('panel-dimitra')
  await fits(page)
  await enter(page, anna, 'Βάρος', '5'); await enter(page, anna, 'Επαναλήψεις', '10')
  const curls = dimitra.locator('form').filter({ has: page.getByRole('heading', { name: 'TRX Biceps Curls', exact: true }) })
  await curls.getByRole('button', { name: 'Παράλειψη', exact: true }).click()
  const triceps = dimitra.locator('form').filter({ has: page.getByRole('heading', { name: 'TRX Triceps Extensions', exact: true }) })
  await expect(triceps).toBeVisible()
  await expect(page.getByRole('button', { name: 'Καταγραφή και αλλαγή', exact: true })).toHaveCount(0)
  await enter(page, triceps, 'Επαναλήψεις', '11')
  await fits(page)
  await page.getByRole('button', { name: 'Καταγραφή και αλλαγή', exact: true }).click()
  await synchronize(page)
  expect(Object.values(remote.workouts[0].results).filter(r => r.status === 'skipped')).toHaveLength(1)
  expect(Object.values(remote.workouts[0].results).filter(r => r.status === 'completed')).toHaveLength(2)
})

test('private notes and unequal side values persist offline without expanding the training screen', async ({ page, context }) => {
  const { workout } = await mockAccount(page, 'coach', true, { fit: true, active: true, configureWorkout: w => { w.results = {}; w.stationIndex = 2 } })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna')
  await expect(anna).toBeVisible()
  await context.setOffline(true)
  await anna.getByRole('button', { name: 'Σημείωση προπονητή Άννα', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('Ισορροπία και σταθερός ρυθμός.')
  await expect(anna.locator('.note-indicator')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Έτοιμο', exact: true }).click()
  await enter(page, anna, 'Βάρος', '6.25'); await enter(page, anna, 'Επαναλήψεις', '10')
  if (await anna.getByRole('button', { name: 'Διαφορετική τιμή ανά πλευρά', exact: true }).count()) await anna.getByRole('button', { name: 'Διαφορετική τιμή ανά πλευρά', exact: true }).click()
  else await anna.getByRole('button', { name: /^Επεξεργασία επαναλήψεις / }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^Άλλη πλευρά/).fill('12')
  await dialog.getByRole('button', { name: 'Έτοιμο', exact: true }).click()
  await anna.getByRole('button', { name: 'Καταγραφή', exact: true }).click()
  await expect(anna.getByText('Έγινε', { exact: true })).toHaveCount(1)
  // Vite's development assets are not cached; the production PWA check covers a fully offline reload.
  await context.setOffline(false)
  await page.reload()
  await fits(page)
  await anna.getByRole('button', { name: 'Σημείωση προπονητή Άννα', exact: true }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox')).toHaveValue('Ισορροπία και σταθερός ρυθμός.')
  await dialog.getByRole('button', { name: 'Έτοιμο', exact: true }).click()
  await anna.getByRole('button', { name: page.viewportSize()!.height < 520 ? /^Επεξεργασία επαναλήψεις / : 'Λεπτομέρειες Split Squats', exact: true }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel(/^Άλλη πλευρά/)).toHaveValue('12')
  await expect(dialog.getByLabel(/^Άλλη πλευρά/)).toBeDisabled()
})

test('rotation and keyboard-sized editing preserve values and keep the editor inside the visible viewport', async ({ page }) => {
  const { workout } = await mockAccount(page, 'coach', true, { fit: true, active: true, configureWorkout: w => { w.results = {} } })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna')
  await enter(page, anna, 'Βάρος', '125.25')
  await page.setViewportSize({ width: 844, height: 390 })
  await fits(page)
  await anna.getByRole('button', { name: /^Επεξεργασία βάρος / }).click()
  await page.evaluate(() => { Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 250 }); window.visualViewport!.dispatchEvent(new Event('resize')) })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel(/^Βάρος/)).toHaveValue('125.25')
  await expect.poll(async () => { const box = (await dialog.boundingBox())!; return box.y + box.height }).toBeLessThanOrEqual(250)
  await dialog.getByLabel(/^Βάρος/).fill('127.5')
  await dialog.getByRole('button', { name: 'Έτοιμο', exact: true }).click()
  await page.evaluate(() => { delete (window.visualViewport as unknown as { height?: number }).height; window.visualViewport!.dispatchEvent(new Event('resize')) })
  await page.setViewportSize({ width: 800, height: 1280 })
  await expect(anna.getByLabel(/^Βάρος/)).toHaveValue('127.5')
  await fits(page)
  // A tablet input opens the focused editor when its on-screen keyboard reduces the visual viewport.
  await anna.getByLabel(/^Βάρος/).focus()
  await page.evaluate(() => { Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 500 }); window.visualViewport!.dispatchEvent(new Event('resize')) })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel(/^Βάρος/)).toHaveValue('127.5')
  await expect.poll(async () => { const box = (await dialog.boundingBox())!; return box.y + box.height }).toBeLessThanOrEqual(500)
  await dialog.getByLabel(/^Βάρος/).fill('130')
  await dialog.getByRole('button', { name: 'Έτοιμο', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.evaluate(() => { delete (window.visualViewport as unknown as { height?: number }).height; window.visualViewport!.dispatchEvent(new Event('resize')) })
  await expect(anna.getByLabel(/^Βάρος/)).toHaveValue('130')
  await fits(page)
})
