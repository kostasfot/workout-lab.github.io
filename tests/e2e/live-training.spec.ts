import { test, expect, type Page } from '@playwright/test'

async function start(page: Page, routine = 1) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Προεπισκόπηση στη συσκευή', exact: true }).click()
  await page.getByRole('button', { name: `Έναρξη Προπόνηση ${routine}`, exact: true }).click()
  await page.getByRole('button', { name: 'Έναρξη προπόνησης', exact: true }).click()
  await expect(page.getByTestId('panel-anna')).toBeVisible()
}
async function fillPair(page: Page, values = ['10', '12'], weight = '6.25') {
  for (const [index, athlete] of ['anna', 'dimitra'].entries()) {
    const panel = page.getByTestId(`panel-${athlete}`)
    const load = panel.getByLabel(/^Βάρος/)
    if (await load.count()) await load.fill(weight)
    await panel.getByLabel(/^(Επαναλήψεις|Διάρκεια)/).fill(values[index])
  }
}
async function recordPairIndividually(page: Page) {
  for (const athlete of ['anna', 'dimitra']) await page.getByTestId(`panel-${athlete}`).getByRole('button', { name: 'Καταγραφή', exact: true }).click()
}

test('reuse fills separate athlete values without recording and survives reload, then uses saved history', async ({ page, context }) => {
  await start(page)
  const anna = page.getByTestId('panel-anna'), dimitra = page.getByTestId('panel-dimitra')
  await expect(anna.getByRole('button', { name: 'Ίδιο με πριν' })).toHaveCount(0)
  await fillPair(page); await recordPairIndividually(page)
  await page.getByRole('button', { name: 'Αλλαγή ασκήσεων', exact: true }).click()
  await expect(anna.getByRole('heading', { name: 'TRX Rows', exact: true })).toBeVisible()
  await fillPair(page, ['11', '9'], '8'); await recordPairIndividually(page)
  await page.getByRole('button', { name: 'Επόμενος γύρος', exact: true }).click()
  await anna.getByRole('button', { name: 'Ίδιο με πριν' }).click()
  await expect(anna.getByLabel(/^Βάρος/)).toHaveValue('6.25')
  await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('10')
  await expect(dimitra.getByLabel(/^Επαναλήψεις/)).toHaveValue('')
  await expect(anna.getByText('Έγινε', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Αλλαγή ασκήσεων', exact: true })).toBeDisabled()
  await context.setOffline(true)
  await dimitra.getByRole('button', { name: 'Ίδιο με πριν' }).click()
  await expect(dimitra.getByLabel(/^Επαναλήψεις/)).toHaveValue('12')
  await context.setOffline(false); await page.reload()
  await expect(anna.getByLabel(/^Βάρος/)).toHaveValue('6.25')
  await expect(dimitra.getByLabel(/^Επαναλήψεις/)).toHaveValue('12')
  await anna.getByRole('button', { name: 'Αύξηση 1 επαναλήψεων Άννα Goblet Squats', exact: true }).click()
  await recordPairIndividually(page)
  await expect(anna.getByRole('button', { name: 'Ίδιο με πριν' })).toBeDisabled()
  await page.getByRole('button', { name: 'Ολοκλήρωση', exact: true }).click()
  await page.getByRole('button', { name: 'Αποθήκευση & τέλος', exact: true }).click()
  await page.goto('/#/'); await page.getByRole('button', { name: 'Ξεκινήστε προπόνηση', exact: true }).click()
  await page.getByRole('button', { name: 'Έναρξη προπόνησης', exact: true }).click()
  await anna.getByRole('button', { name: 'Ίδιο με πριν' }).click()
  await dimitra.getByRole('button', { name: 'Ίδιο με πριν' }).click()
  await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('11')
  await expect(dimitra.getByLabel(/^Επαναλήψεις/)).toHaveValue('12')
  await expect(anna).toContainText('Προηγούμενη προπόνηση')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
