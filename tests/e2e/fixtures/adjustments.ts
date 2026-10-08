import type { Locator, Page } from '@playwright/test'

export async function clickAdjustment(root: Locator | Page, action: string, options?: { clickCount?: number }) {
  const match = action.match(/^(Αύξηση|Μείωση) (\d+(?:\.\d+)?) (kg|επαναλήψεων|δευτερολέπτων) (.+)$/)
  if (!match) throw new Error(`Unknown adjustment: ${action}`)
  await root.getByRole('combobox', { name: `Βήμα ${match[3] === 'kg' ? 'βάρους' : match[3]} ${match[4]}`, exact: true }).selectOption(match[2])
  await root.getByRole('button', { name: action, exact: true }).click(options)
}
