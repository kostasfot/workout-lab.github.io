import { test, expect } from '@playwright/test'

test('existing six-character passwords reach authentication; new passwords require eight characters', async ({ page }) => {
  const submissions: unknown[] = []
  await page.route('**/auth/v1/token?grant_type=password', async route => {
    submissions.push(route.request().postDataJSON())
    await route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
    })
  })
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('six-character@example.com')
  const password = page.getByLabel('Κωδικός', { exact: true })
  await password.fill('123456')
  await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Η σύνδεση απέτυχε')
  expect(submissions).toHaveLength(1)
  expect(submissions[0]).toEqual(expect.objectContaining({ email: 'six-character@example.com', password: '123456' }))
  await expect(page.getByRole('button', { name: 'Σύνδεση', exact: true })).toBeEnabled()

  await page.goto('/?recovery=1')
  const newPassword = page.getByLabel('Νέος κωδικός', { exact: true })
  await newPassword.fill('123456')
  await page.getByRole('button', { name: 'Αλλαγή κωδικού', exact: true }).click()
  expect(await newPassword.evaluate((input: HTMLInputElement) => input.validity.tooShort)).toBe(true)
  await newPassword.fill('12345678')
  expect(await newPassword.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true)
})
