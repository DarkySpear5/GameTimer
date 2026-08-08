/**
 * Guessing a searchable game name from what a running process can tell us.
 * Pure, so the rules are testable — and they need to be, because measurement
 * is what chose them.
 *
 * Across a real 13-game library the .exe's embedded ProductName was correct 5
 * times, empty 3 times, and actively WRONG 4 times: Stardew Valley reports
 * "SMAPI", Palia and Funnel Runners both report "BootstrapPackagedGame", and
 * Mabinogi reports "Nexon Steam Connector". The containing folder name was
 * correct essentially always. So folder wins, and ProductName is not consulted
 * at all.
 */

/** Strips the launcher/architecture noise that would derail a search. */
const NOISE = /\b(win64|win32|x64|x86|shipping|launcher|client|game|release|final|steam|epic|gog)\b/gi

function clean(value: string): string {
  return value
    .replace(/\.exe$/i, '')
    .replace(/[_-]+/g, ' ')
    // Split camelCase and PascalCase runs: "AbioticFactor" -> "Abiotic Factor",
    // which the search engine handles far better than the concatenated form.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Directory names that carry no information about the game — an exe sitting in
 * one of these means the useful name is further up the tree.
 */
const GENERIC_DIRS = new Set([
  'bin',
  'bin64',
  'binaries',
  'win64',
  'win32',
  'x64',
  'x86',
  'game',
  'build',
  'builds',
  'release',
  'retail',
  'shipping'
])

/**
 * Walks up from the executable to the first directory that actually names
 * something, stopping before generic build folders. `.../AbioticFactor/
 * Binaries/Win64/AbioticFactor.exe` yields "Abiotic Factor", not "Win64".
 */
export function folderNameFor(exePath: string): string {
  const parts = exePath.replace(/\//g, '\\').split('\\').filter(Boolean)
  parts.pop() // drop the exe itself
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (GENERIC_DIRS.has(part.toLowerCase())) continue
    // Stop at drive roots and library markers rather than walking to C:\.
    if (/^[a-z]:$/i.test(part) || part.toLowerCase() === 'common' || part.toLowerCase() === 'steamapps') break
    return clean(part)
  }
  return ''
}

/**
 * Best-effort search terms for a non-Steam game, best signal first. The caller
 * tries each until one produces a match, and shows whatever it finds for
 * confirmation — none of these are trustworthy enough to apply silently.
 */
export function candidateNames(exePath: string, windowTitle: string): string[] {
  const out: string[] = []
  const push = (v: string): void => {
    const c = clean(v)
    if (c && c.length > 1 && !out.some((existing) => existing.toLowerCase() === c.toLowerCase())) out.push(c)
  }

  push(folderNameFor(exePath))
  // Window titles are often decorated ("DOOM Eternal - 143 FPS"); take the
  // part before a separator, which is nearly always the bare title.
  push(windowTitle.split(/\s+[-–|:]\s+/)[0] ?? '')
  push(exePath.replace(/\//g, '\\').split('\\').pop() ?? '')
  return out
}
