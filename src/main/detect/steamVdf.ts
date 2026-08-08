/**
 * Pure parsing for Steam's two on-disk formats. Both are Valve KeyValues text,
 * not JSON, but everything needed here is a flat `"key"  "value"` lookup — a
 * full KV parser would be a dependency and a liability for four fields.
 *
 * Kept free of `electron` and `fs` so it can be unit-tested against real
 * fixture text.
 */

export interface SteamGame {
  appId: number
  /** Steam's own official name for the game — better than anything guessable from disk. */
  name: string
  /** Folder under steamapps/common, which is what an exe path can be matched against. */
  installDir: string
}

/** Reads a flat `"key"  "value"` pair out of a KeyValues blob. */
function kv(text: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(text)
  return m ? m[1] : null
}

/**
 * Library roots from steamapps/libraryfolders.vdf. Steam stores extra drives
 * here, so a game is frequently not under the folder Steam itself is installed
 * in. Paths are stored with escaped backslashes.
 */
export function parseLibraryFolders(vdf: string): string[] {
  const out: string[] = []
  const re = /"path"\s+"([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(vdf)) !== null) out.push(m[1].replace(/\\\\/g, '\\'))
  return out
}

/** One appmanifest_<appid>.acf. Returns null if it lacks any field we need. */
export function parseAppManifest(acf: string): SteamGame | null {
  const appId = Number(kv(acf, 'appid'))
  const name = kv(acf, 'name')
  const installDir = kv(acf, 'installdir')
  if (!appId || !name || !installDir) return null
  return { appId, name, installDir }
}

/**
 * Finds which installed game an executable belongs to by locating
 * `steamapps\common\<installdir>` inside its path.
 *
 * Matching on the install directory rather than the exe name is the whole
 * point: exe names are arbitrary and their embedded metadata lies (Stardew
 * Valley's largest binary reports itself as "SMAPI"), whereas the manifest's
 * installdir is authoritative and maps straight to an exact appid.
 */
export function matchExeToGame(exePath: string, games: SteamGame[]): SteamGame | null {
  const lower = exePath.toLowerCase().replace(/\//g, '\\')
  const marker = '\\steamapps\\common\\'
  const at = lower.indexOf(marker)
  if (at === -1) return null
  const rest = lower.slice(at + marker.length)
  const folder = rest.split('\\')[0]
  if (!folder) return null
  return games.find((g) => g.installDir.toLowerCase() === folder) ?? null
}
