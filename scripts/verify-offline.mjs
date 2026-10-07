import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'

// An isolated production build deliberately uses local mode to verify the PWA
// without a Supabase password or changing the real project's configuration.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = await mkdtemp(join(tmpdir(), 'workout-lab-offline-'))
const base = '/workout-lab.github.io/'
const port = 4174
const url = `http://127.0.0.1:${port}${base}`
const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_BASE_PATH: base }
let server, browser
try {
  await new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build', '--', '--outDir', output], { cwd: root, env, stdio: 'inherit' })
    build.on('error', reject)
    build.on('exit', code => code === 0 ? resolve() : reject(new Error(`Build failed (${code})`)))
  })
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', output, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, stdio: 'pipe' })
  let failure
  server.on('error', error => { failure = error })
  server.on('exit', code => { failure = new Error(`Preview stopped (${code})`) })
  for (let attempt = 0; attempt < 60; attempt++) {
    if (failure) throw failure
    try { if ((await fetch(url)).ok) break } catch { /* startup in progress */ }
    if (attempt === 59) throw new Error('Preview did not start')
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.getByRole('button', { name: 'Άνοιγμα εφαρμογής', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Καλώς ήρθατε στο Lab.' })).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  // Prompt-based registration takes control on the next navigation.
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.getByRole('button', { name: 'Ξεκινήστε προπόνηση' }).click()
  await page.getByRole('button', { name: 'Έναρξη προπόνησης', exact: true }).click()
  const anna = page.getByTestId('panel-anna')
  await anna.getByRole('button', { name: 'Αύξηση 1.25 kg Άννα Goblet Squats', exact: true }).click()
  await anna.getByRole('button', { name: 'Αύξηση 2.5 kg Άννα Goblet Squats', exact: true }).click()
  await expect(anna.getByLabel(/^Βάρος/)).toHaveValue('3.75')
  await anna.getByRole('button', { name: 'Αύξηση 5 επαναλήψεων Άννα Goblet Squats', exact: true }).click({ clickCount: 2 })
  await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('10')
  await anna.getByRole('button', { name: 'Καταγραφή', exact: true }).click()
  await expect(anna.getByText('Έγινε', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Άνοιγμα χρονομέτρου' }).click()
  await page.getByRole('button', { name: 'Έναρξη', exact: true }).click()
  await page.getByRole('button', { name: 'Κλείσιμο', exact: true }).click()
  await context.setOffline(true)
  await page.reload()
  await expect(anna.getByLabel(/^Βάρος/)).toHaveValue('3.75')
  await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('10')
  await expect(page.locator('.timer-fab')).toContainText(/00:[0-5]\d/)
  // This route's lazy chunk has never been opened online in this context.
  await page.goto(`${url}#/progress`)
  await page.getByRole('button', { name: 'Νέα μέτρηση', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Βάρος (kg)', { exact: true }).fill('103.4')
  await page.getByRole('button', { name: 'Αποθήκευση μέτρησης' }).click()
  await expect(page.locator('.weight-card.anna .current-weight')).toContainText('103,4')
  await page.reload()
  await expect(page.locator('.weight-card.anna .current-weight')).toContainText('103,4')
  await page.getByRole('button', { name: /^Διαγραφή μέτρησης Άννα/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Διαγραφή', exact: true }).click()
  await expect(page.locator('.weight-card.anna .current-weight')).toContainText('—')
  await page.reload()
  await expect(page.locator('.weight-card.anna .current-weight')).toContainText('—')
  await page.locator('.resume-strip').click()
  await expect(anna.getByLabel(/^Βάρος/)).toHaveValue('3.75')
  await page.screenshot({ path: join(root, 'test-results', 'offline-workout-tablet.png'), fullPage: true })
  await page.getByRole('button', { name: 'Ολοκλήρωση', exact: true }).click()
  await page.getByRole('button', { name: 'Αποθήκευση & τέλος' }).click()
  await expect(page.getByText('3,75 kg / αλτήρα · 10 επ.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Επεξεργασία προπόνησης', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Επεξεργασία προπόνησης', exact: true })
  await editor.getByLabel('Ημερομηνία προπόνησης').fill('2026-10-01')
  await editor.getByRole('region', { name: 'Άννα Goblet Squats σετ 1', exact: true }).getByRole('button', { name: /^Αύξηση 1 επαναλήψεων/ }).click()
  await editor.getByRole('button', { name: 'Αποθήκευση αλλαγών', exact: true }).click()
  await expect(page.getByText('3,75 kg / αλτήρα · 11 επ.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('dialog').locator('.modal-heading p')).toContainText('1 Οκτωβρίου 2026')
  await expect(page.getByText('3,75 kg / αλτήρα · 11 επ.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Διαγραφή σετ Άννα Goblet Squats σετ 1', exact: true }).click()
  await page.getByRole('dialog', { name: 'Διαγραφή καταγεγραμμένου σετ', exact: true }).getByRole('button', { name: 'Διαγραφή', exact: true }).click()
  await expect(page.locator('.result-history-row')).toHaveCount(43)
  await page.reload()
  await expect(page.locator('.result-history-row')).toHaveCount(43)
  await page.getByRole('button', { name: 'Διαγραφή προπόνησης', exact: true }).click()
  await page.getByRole('dialog', { name: 'Διαγραφή προπόνησης', exact: true }).getByRole('button', { name: 'Διαγραφή', exact: true }).click()
  await expect(page.getByText('Το ιστορικό σας ξεκινά εδώ.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Το ιστορικό σας ξεκινά εδώ.', { exact: true })).toBeVisible()
  // New route, workout replacement, and discard all remain usable fully offline.
  await page.goto(`${url}#/`)
  await page.getByRole('button', { name: 'Έναρξη Προπόνηση 3', exact: true }).click()
  await page.getByRole('button', { name: 'Έναρξη προπόνησης', exact: true }).click()
  await anna.getByRole('button', { name: /^Αύξηση 10 δευτερολέπτων/ }).click()
  await anna.getByRole('button', { name: /^Αύξηση 5 δευτερολέπτων/ }).click()
  await expect(anna.getByLabel(/^Διάρκεια/)).toHaveValue('15')
  await page.reload()
  await expect(anna.getByLabel(/^Διάρκεια/)).toHaveValue('15')
  await page.goto(`${url}#/`)
  await page.getByRole('button', { name: 'Έναρξη Προπόνηση 2', exact: true }).click()
  await page.getByRole('button', { name: 'Διακοπή και νέα προπόνηση', exact: true }).click()
  await page.getByRole('dialog', { name: 'Διακοπή και νέα προπόνηση', exact: true }).getByRole('button', { name: 'Διακοπή και έναρξη', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Προπόνηση 2.', exact: true })).toBeVisible()
  await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Προπόνηση 2.', exact: true })).toBeVisible()
  await expect(anna.getByLabel(/^Επαναλήψεις/)).toHaveValue('')
  await page.getByRole('button', { name: 'Διακοπή', exact: true }).click()
  await page.getByRole('dialog', { name: 'Διακοπή χωρίς αποθήκευση', exact: true }).getByRole('button', { name: 'Διακοπή χωρίς αποθήκευση', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ξεκινήστε προπόνηση', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.resume-strip')).toHaveCount(0)
  await page.getByRole('button', { name: 'Άνοιγμα χρονομέτρου', exact: true }).click()
  await expect(page.locator('.timer-job')).toHaveCount(0)
  await page.getByRole('button', { name: 'Κλείσιμο', exact: true }).click()
  await page.goto(`${url}#/history`)
  await expect(page.getByText('Το ιστορικό σας ξεκινά εδώ.', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
  console.log('PASS: production PWA offline reloads, cached routes, weight/reps/seconds adjustments, corrected workout dates, history deletion, replacement/discard, and timer recovery/cleanup.')
} finally {
  if (browser) await browser.close()
  if (server) {
    const stopped = new Promise(resolve => server.once('exit', resolve))
    if (server.exitCode === null) { server.kill(); await stopped }
  }
  await rm(output, { recursive: true, force: true })
}
