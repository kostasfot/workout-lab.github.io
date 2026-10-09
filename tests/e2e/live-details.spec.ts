import { test, expect } from '@playwright/test'
import { mockAccount, synchronize } from './fixtures/cloud'
import { clickAdjustment } from './fixtures/adjustments'
import { requiredResults } from '../../src/lib/model'

test('coach notes expand on demand and preserve edits through collapse, sync and reload', async ({ page, context }, info) => {
  const { workout, requests, remote } = await mockAccount(page, 'coach', true, { active: true })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna'), dimitra = page.getByTestId('panel-dimitra')
  const note = anna.getByRole('textbox', { name: 'Ιδιωτική σημείωση προπονητή Άννα', exact: true }), summary = anna.locator('.coach-note > summary')
  await expect(note).toBeHidden(); await expect(anna.locator('.note-indicator')).toBeVisible()
  await expect(dimitra.locator('.note-indicator')).toHaveCount(0)
  expect(requests).toHaveLength(0)
  if (info.project.use.hasTouch) await summary.tap(); else { await summary.focus(); await page.keyboard.press('Enter') }
  await expect(note).toHaveValue('private note')
  await context.setOffline(true)
  await note.fill('Σταθερός ρυθμός και καλή τεχνική.')
  await summary.click(); await expect(note).toBeHidden()
  await summary.click(); await expect(note).toHaveValue('Σταθερός ρυθμός και καλή τεχνική.')
  await expect(dimitra.getByRole('textbox')).toBeHidden()
  await context.setOffline(false); await synchronize(page)
  expect(remote.notes.find(n => n.athlete === 'anna')?.text).toBe('Σταθερός ρυθμός και καλή τεχνική.')
  expect(requests.some(r => r.kind === 'workout')).toBe(false)
  await page.goto(`/#/workout/${workout.id}`); await page.reload()
  await expect(note).toBeHidden(); await summary.click()
  await expect(note).toHaveValue('Σταθερός ρυθμός και καλή τεχνική.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('optional other-side entry preserves collapsed values and automatically reveals recorded differences', async ({ page }) => {
  const { workout } = await mockAccount(page, 'coach', true, { active: true, configureWorkout: w => { w.stationIndex = 2; w.results = {} } })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna'), toggle = anna.getByRole('button', { name: /^Διαφορετική τιμή ανά πλευρά/ }), side = anna.getByLabel(/^Άλλη πλευρά/)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(side).toBeHidden()
  await anna.getByLabel(/^Βάρος/).fill('5'); await anna.getByLabel(/^Επαναλήψεις/).fill('10')
  await toggle.click(); await expect(side).toBeVisible()
  await clickAdjustment(anna, 'Αύξηση 1 επαναλήψεων Άλλη πλευρά Άννα Split Squats')
  await expect(side).toHaveValue('11'); await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('10')
  await toggle.click(); await expect(side).toBeHidden(); await expect(toggle).toContainText('11 επ.')
  await anna.getByRole('button', { name: 'Καταγραφή', exact: true }).click()
  await expect(side).toBeVisible(); await expect(side).toBeDisabled(); await expect(side).toHaveValue('11')
  await page.reload(); await expect(side).toBeVisible(); await expect(side).toHaveValue('11')
  await anna.getByRole('button', { name: 'Αλλαγή καταγραφής', exact: true }).click()
  await side.fill(''); await toggle.click(); await expect(side).toBeHidden()
  await page.reload(); await expect(side).toBeHidden(); await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('10')
})

test('previous results and reuse share one compact row and copied other-side differences remain visible', async ({ page }, info) => {
  const { workout } = await mockAccount(page, 'coach', true, { active: true, configureWorkout: w => {
    w.stationIndex = 2; w.results = {}
    const prior = requiredResults(w, true).find(r => r.athlete === 'anna')!
    w.results[prior.key] = { ...prior, status: 'completed', weight: 6.25, value: 10, otherSide: 12 }
    w.roundIndex = 1
  } })
  await page.goto(`/#/workout/${workout.id}`)
  const anna = page.getByTestId('panel-anna'), row = anna.locator('.previous-entry'), copy = row.getByRole('button', { name: 'Ίδιο με πριν', exact: true })
  await expect(row.locator('.previous-result')).toHaveAttribute('title', 'Προηγούμενος γύρος: 6,25 kg · 10 / 12 επ.')
  await expect(anna.getByLabel(/^Άλλη πλευρά/)).toBeHidden()
  const text = (await row.locator('.previous-result').boundingBox())!, button = (await copy.boundingBox())!
  expect(Math.abs(text.y + text.height / 2 - button.y - button.height / 2)).toBeLessThan(2)
  expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await copy.click()
  await expect(anna.getByLabel(/^Βάρος/)).toHaveValue('6.25'); await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('10')
  await expect(anna.getByLabel(/^Άλλη πλευρά/)).toBeVisible(); await expect(anna.getByLabel(/^Άλλη πλευρά/)).toHaveValue('12')
  await expect(anna.getByText('Έγινε', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('expanded-live-details.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
