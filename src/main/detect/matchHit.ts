import type { GameSearchHit } from '@shared/types'

/**
 * Steam's SearchApps endpoint is a SUBSTRING matcher, not a relevance ranker,
 * and its first result is frequently not the thing you asked for. Measured:
 *
 *   "Hollow Knight" -> [Hollow Knight: Silksong, Hollow Knight]   (wrong first)
 *   "Palworld"      -> [Palworld, Palworld: Palfarm, Pal♡world!]  (right first)
 *   "Claude"        -> [Claude Monet…, Meet Claude, World of ClaudeCraft]
 *   "Discord"       -> [Discord Bot Maker, Bot Maker For Discord, …]
 *
 * The signal that separates a real game from a coincidental substring is an
 * EXACT name match, not position. That single rule does two jobs: it picks the
 * right appid, and it tells us whether the thing is a game at all — "Claude"
 * and "Discord" return plenty of hits but never themselves.
 */

/** Case, punctuation and spacing all vary between a folder name and Steam's title. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * The hit whose name IS the query, or null when the query merely appears
 * inside other titles. Null is the "this is not a game" answer.
 */
export function exactHit(query: string, hits: GameSearchHit[]): GameSearchHit | null {
  const target = normalize(query)
  if (!target) return null
  return hits.find((h) => normalize(h.name) === target) ?? null
}

/**
 * Whether a name looks like a real game according to Steam's catalogue.
 * Deliberately strict — a false "yes" puts a non-game in the picker's Games
 * group, which is exactly the confusion this is meant to remove.
 */
export function looksLikeGame(query: string, hits: GameSearchHit[]): boolean {
  return exactHit(query, hits) !== null
}
