import { test, expect } from '@playwright/test'

test('blue start button lets the coach choose every workout without starting a cancelled selection', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Προεπισκόπηση στη συσκευή' }).click()
  await page.getByRole('button', { name: 'Ξεκινήστε προπόνηση', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Έτοιμες για προπόνηση;', exact: true })
  await dialog.getByLabel('Επιλογή προπόνησης').selectOption({ index: 2 })
  await dialog.getByRole('button', { name: 'Ακύρωση', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.resume-strip')).toHaveCount(0)
  const movements = ['Goblet Squats', 'Sumo Squats', 'Dumbbell Thrusters']
  for (let index = 0; index < movements.length; index++) {
    await page.getByRole('button', { name: 'Ξεκινήστε προπόνηση', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Έτοιμες για προπόνηση;', exact: true })
    const picker = dialog.getByLabel('Επιλογή προπόνησης')
    await picker.selectOption({ index })
    await expect(picker.locator('option:checked')).toContainText(`Προπόνηση ${index + 1}`)
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    if (index === 2) await page.screenshot({ path: `test-results/workout-picker-${info.project.name}.png`, fullPage: true })
    await dialog.getByRole('button', { name: 'Έναρξη προπόνησης', exact: true }).click()
    await expect(page.getByRole('heading', { name: `Προπόνηση ${index + 1}.`, exact: true })).toBeVisible()
    await expect(page.getByTestId('panel-anna').getByRole('heading', { name: movements[index], exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: `Προπόνηση ${index + 1}.`, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Διακοπή', exact: true }).click()
    await page.getByRole('dialog', { name: 'Διακοπή χωρίς αποθήκευση', exact: true }).getByRole('button', { name: 'Διακοπή χωρίς αποθήκευση', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Ξεκινήστε προπόνηση', exact: true })).toBeVisible()
  }
  await page.goto('/#/history')
  await expect(page.getByText('Το ιστορικό σας ξεκινά εδώ.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
