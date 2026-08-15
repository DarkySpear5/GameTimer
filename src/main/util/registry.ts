import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Read-only registry access via PowerShell's registry provider.
 *
 * Was `reg.exe query` with regex parsing of its text-table output — replaced
 * after a real, measured bug: `reg.exe`'s stdout, once piped (non-interactive,
 * exactly how execFile runs it), goes through Windows' lossy "best-fit"
 * Unicode-to-codepage downconversion before Gamut ever sees the bytes. A
 * DisplayName containing a real ™ (U+2122) comes back as a plain "T" — not a
 * parsing bug on Gamut's side, `reg.exe` itself already emits the mangled
 * text. Reproduced live with a throwaway HKCU test value: `reg.exe query`
 * printed "Need for SpeedT Most Wanted" for a value that was set to
 * "Need for Speed™ Most Wanted". This is exactly why an EA-detected game's
 * name broke Steam/Epic/GOG's exact-title art matching — EA's own uninstall
 * DisplayName carries a ™, Gamut's registry read silently corrupted it to a
 * "T", and no title in any catalogue normalizes to match "...SpeedT...".
 *
 * PowerShell's own `ConvertTo-Json` suffers the identical mangling by
 * default (measured the same way, same "T" result) — the fix isn't "use
 * PowerShell instead of reg.exe", it's forcing `[Console]::OutputEncoding`
 * to UTF-8 before writing any output, which measured correctly round-trips
 * the real ™ character end to end. `encoding: 'utf8'` on the Node side pairs
 * with that — matches the exact fix, not just part of it.
 */

function ps(script: string, timeout: number): Promise<string> {
  return execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    encoding: 'utf8',
    timeout
  }).then((r) => r.stdout)
}

/**
 * `reg.exe`-style short root names (`HKLM\...`, `HKCU\...`, still used by
 * every caller in installedSources.ts) and the long `HKEY_*\...` form this
 * module's own results come back as (fed straight back into `regValues` by
 * the GOG scan) both need to resolve through PowerShell's `Registry::`
 * provider prefix, which only accepts the long form.
 */
function toProviderPath(key: string): string {
  if (key.startsWith('Registry::')) return key
  const long = key.replace(/^HKLM\\/, 'HKEY_LOCAL_MACHINE\\').replace(/^HKCU\\/, 'HKEY_CURRENT_USER\\')
  return `Registry::${long}`
}

/** Every property on a key except the PSDrive/PSPath bookkeeping PowerShell's registry provider adds to every result. */
const VALUES_EXPR =
  '$values = @{}; foreach ($p in $item.PSObject.Properties) { if ($p.Name -notmatch \'^PS(Path|ParentPath|ChildName|Drive|Provider)$\') { $values[$p.Name] = "$($p.Value)" } }'

/** Full paths of a key's immediate subkeys. Empty when the key is absent. */
export async function regSubkeys(key: string): Promise<string[]> {
  try {
    const stdout = await ps(
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Get-ChildItem -Path '${toProviderPath(key)}' -ErrorAction SilentlyContinue |
  ForEach-Object { $_.Name } | ConvertTo-Json -Compress`,
      10_000
    )
    const parsed: unknown = stdout.trim() ? JSON.parse(stdout) : []
    const names = Array.isArray(parsed) ? parsed : [parsed]
    return names.filter((n): n is string => typeof n === 'string')
  } catch {
    return []
  }
}

/** A key's own values, keyed by name. Empty when absent or valueless. */
export async function regValues(key: string): Promise<Record<string, string>> {
  try {
    const stdout = await ps(
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$item = Get-ItemProperty -Path '${toProviderPath(key)}' -ErrorAction SilentlyContinue
if ($item) { ${VALUES_EXPR}; $values | ConvertTo-Json -Compress } else { '{}' }`,
      10_000
    )
    const parsed: unknown = stdout.trim() ? JSON.parse(stdout) : {}
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export interface RegKey {
  key: string
  values: Record<string, string>
}

/**
 * A whole key tree in ONE PowerShell invocation (`-Recurse`).
 *
 * The Uninstall hive has ~250 subkeys on a normal machine; querying each
 * one separately would be ~250 process spawns and several seconds. This
 * reads the lot at once and maps each to its own values, which is the
 * difference between a scan that feels instant and one the user waits on.
 */
export async function regTree(key: string): Promise<RegKey[]> {
  try {
    const stdout = await ps(
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$results = @(Get-ChildItem -Path '${toProviderPath(key)}' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
  $item = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
  if ($item) {
    ${VALUES_EXPR}
    [PSCustomObject]@{ Key = $_.Name; Values = $values }
  }
})
$results | ConvertTo-Json -Compress -Depth 5`,
      30_000
    )
    const parsed: unknown = stdout.trim() ? JSON.parse(stdout) : []
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows
      .filter((r): r is { Key: unknown; Values: unknown } => typeof r === 'object' && r !== null)
      .filter((r) => typeof r.Key === 'string' && typeof r.Values === 'object' && r.Values !== null)
      .map((r) => ({ key: r.Key as string, values: r.Values as Record<string, string> }))
  } catch {
    return []
  }
}

/** Last path segment of a registry key — usually the human-readable name. */
export function regKeyName(fullKey: string): string {
  return fullKey.split('\\').pop() ?? fullKey
}
