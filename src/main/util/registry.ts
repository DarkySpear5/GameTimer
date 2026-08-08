import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Minimal read-only registry access via `reg.exe`.
 *
 * Node cannot read the registry on its own and this keeps the dependency count
 * at zero, matching how steamLibrary.ts already finds Steam's install root.
 * Arguments are always passed as a fixed array — never interpolated into a
 * shell string — so a key name can't turn into another command.
 */

/** Full paths of a key's immediate subkeys. Empty when the key is absent. */
export async function regSubkeys(key: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', key], {
      windowsHide: true,
      timeout: 10_000
    })
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.toUpperCase().startsWith('HKEY_') && l.length > key.length)
  } catch {
    // Absent key, or no permission — both mean "nothing here", never an error.
    return []
  }
}

/** A key's string values, keyed by name. Empty when absent or valueless. */
export async function regValues(key: string): Promise<Record<string, string>> {
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', key], {
      windowsHide: true,
      timeout: 10_000
    })
    const out: Record<string, string> = {}
    for (const raw of stdout.split(/\r?\n/)) {
      // "    Name    REG_SZ    value with spaces"
      const m = /^\s{4,}(\S.*?)\s{4,}REG_(?:SZ|EXPAND_SZ|MULTI_SZ|DWORD)\s{4,}(.*)$/.exec(raw)
      if (m) out[m[1].trim()] = m[2].trim()
    }
    return out
  } catch {
    return {}
  }
}

export interface RegKey {
  key: string
  values: Record<string, string>
}

/**
 * A whole key tree in ONE `reg.exe` call (`/s`).
 *
 * The Uninstall hive has ~250 subkeys on a normal machine; querying each one
 * separately would be ~250 process spawns and several seconds. This reads the
 * lot at once and splits it, which is the difference between a scan that feels
 * instant and one the user waits on.
 */
export async function regTree(key: string): Promise<RegKey[]> {
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync('reg.exe', ['query', key, '/s'], {
      windowsHide: true,
      timeout: 30_000,
      // The Uninstall hive dumps well past the default 1MB buffer.
      maxBuffer: 32 * 1024 * 1024
    }))
  } catch {
    return []
  }

  const out: RegKey[] = []
  let current: RegKey | null = null
  for (const raw of stdout.split(/\r?\n/)) {
    if (raw.toUpperCase().startsWith('HKEY_')) {
      current = { key: raw.trim(), values: {} }
      out.push(current)
      continue
    }
    const m = /^\s{4,}(\S.*?)\s{4,}REG_(?:SZ|EXPAND_SZ|MULTI_SZ|DWORD)\s{4,}(.*)$/.exec(raw)
    if (m && current) current.values[m[1].trim()] = m[2].trim()
  }
  return out
}

/** Last path segment of a registry key — usually the human-readable name. */
export function regKeyName(fullKey: string): string {
  return fullKey.split('\\').pop() ?? fullKey
}
