import { chromium } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
const source = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--no-sandbox'] })
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(`<style>body{margin:0}svg{width:${size}px;height:${size}px}</style>${source}`)
    await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: true })
    await page.close()
  }
} finally { await browser.close() }
