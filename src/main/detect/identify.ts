import { findByExePath } from './steamLibrary'
import { candidateNames } from './candidateName'
import { searchSteamApps } from '../art/steamArt'
import { exactHit } from './matchHit'
import type { GameIdentity } from '@shared/types'

/**
 * Works out which game an executable is, by two paths with very different
 * confidence.
 *
 * Path A — the exe lives under `steamapps\common\<dir>` and a manifest claims
 * that directory. Exact appid, exact official name, no network call, applied
 * silently.
 *
 * Path B — anything else (Epic, GOG, itch, standalone). Guesses a name from
 * the folder and searches Steam's catalogue for it. This is where the
 * confirmation requirement comes from: the search fails closed on nonsense,
 * but fails OPEN on plausible input — "MarvelRivals" confidently returns
 * "Marvel Rivals Playtest", a different app. Never apply a Path B result
 * without showing it first.
 */
export async function identify(exePath: string, windowTitle: string): Promise<GameIdentity> {
  const installed = await findByExePath(exePath)
  if (installed) {
    return { name: installed.name, steamAppId: installed.appId, confident: true, suggestions: [] }
  }

  const candidates = candidateNames(exePath, windowTitle)
  let fallback: GameIdentity | null = null

  for (const candidate of candidates) {
    const hits = await searchSteamApps(candidate)
    if (hits.length === 0) continue

    // An exact title match is the real signal — Steam's ordering is not.
    // "Hollow Knight" returns Silksong first, so taking hits[0] picked the
    // wrong game; and "Claude"/"Discord" return plenty of hits without ever
    // returning themselves, which is how a non-game is recognised.
    const exact = exactHit(candidate, hits)
    if (exact) {
      return { name: exact.name, steamAppId: exact.appId, confident: false, suggestions: hits }
    }
    // Keep the first substring-only result as a last resort, but keep looking
    // for a candidate that matches exactly.
    fallback ??= { name: hits[0].name, steamAppId: hits[0].appId, confident: false, suggestions: hits }
  }

  if (fallback) return fallback

  // Nothing matched — a game with no Steam listing at all, or no network.
  // Keep the best guess as a name so the user still gets the field filled in.
  return { name: candidates[0] ?? '', steamAppId: null, confident: false, suggestions: [] }
}
