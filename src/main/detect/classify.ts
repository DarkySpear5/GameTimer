import { searchSteamApps } from '../art/steamArt'
import { candidateNames } from './candidateName'
import { looksLikeGame } from './matchHit'

/**
 * Asks Steam's catalogue whether each executable is actually a game, for the
 * ones the path heuristic could not place. This is what stops the picker
 * presenting AMD Adrenalin and SteelSeries GG as if they were games.
 *
 * It is strictly a PROMOTION signal. A "no" never hides anything — plenty of
 * games install outside the standard library folders, and offline every answer
 * is "no". The user can always pick from the other group.
 *
 * The check is an exact-title match, not "did the search return anything":
 * searching "Claude" returns World of ClaudeCraft and searching "Discord"
 * returns Discord Bot Maker, so mere hits would classify both as games.
 */
/**
 * The same question asked of a name rather than an executable, for sources that
 * hand over a title and nothing else to judge it by.
 *
 * The Microsoft Store is the case that needs it: Windows does not mark which
 * packages are games, so a scan legitimately turns up Super Lucky's Tale beside
 * Realtek Audio Control and the LG Monitor App. Steam's catalogue knows the
 * difference, and an exact-title match is the rule this project already trusts
 * for exactly this.
 *
 * Promotion only, like classifyGames — offline every answer is "no", and the
 * result is simply that a real game arrives unticked instead of ticked.
 */
export async function classifyNames(names: string[]): Promise<Set<string>> {
  const confirmed = new Set<string>()
  for (const name of names.slice(0, 12)) {
    if (!name) continue
    try {
      if (looksLikeGame(name, await searchSteamApps(name))) confirmed.add(name)
    } catch {
      // offline — the candidate stays unconfirmed, which is the safe direction
    }
  }
  return confirmed
}

export async function classifyGames(exePaths: string[]): Promise<string[]> {
  const confirmed: string[] = []

  // Sequential on purpose: this is a courtesy request to someone else's public
  // endpoint, on a list that is realistically under a dozen entries.
  for (const exePath of exePaths.slice(0, 12)) {
    const candidate = candidateNames(exePath, '')[0]
    if (!candidate) continue
    try {
      if (looksLikeGame(candidate, await searchSteamApps(candidate))) confirmed.push(exePath)
    } catch {
      // offline — everything simply stays where the path heuristic put it
    }
  }
  return confirmed
}
