import { FONT_CHOICES } from '@shared/constants'

let cached: string[] | null = null

/**
 * Curated picks merged with every font actually installed on this PC (incl.
 * third-party installs), as one deduped, alphabetized list — the Settings
 * font picker shows a single dropdown, not two separate lists. font-list
 * shells out to a PowerShell/registry query on Windows the first time;
 * cached in-memory for the rest of the app's life since installed fonts
 * don't change while the app is running.
 */
export async function listFonts(): Promise<string[]> {
  if (cached) return cached
  let installed: string[] = []
  try {
    const fontList = await import('font-list')
    installed = await fontList.getFonts({ disableQuoting: true })
  } catch {
    // font-list can fail on locked-down machines — fall back to the curated list alone
    installed = []
  }
  const merged = new Set([...FONT_CHOICES, ...installed])
  cached = [...merged].sort((a, b) => a.localeCompare(b))
  return cached
}
