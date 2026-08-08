import { net } from 'electron'

/**
 * GOG's public catalogue, used as the second source when Steam has nothing.
 *
 * Chosen because it meets the same bar as the Steam endpoints and nothing else
 * did: no API key, no account, no server of ours. SteamGridDB, RAWG and IGDB
 * were all rejected for requiring a key the user would have to register for.
 *
 * It covers exactly the gap that matters — DRM-free and older titles that never
 * shipped on Steam — and its genre tagging is finer-grained than Steam's
 * (Hollow Knight is tagged Metroidvania here, Action/Adventure there).
 */
const CATALOG = 'https://catalog.gog.com/v1/catalog'

export interface GogGame {
  title: string
  /** Portrait cover, the closest thing GOG has to an icon. */
  coverVertical: string | null
  /** Wide key art, used as the background. */
  coverHorizontal: string | null
  genres: string[]
}

interface RawProduct {
  title?: string
  coverVertical?: string
  coverHorizontal?: string
  galaxyBackgroundImage?: string
  genres?: { name?: string }[]
}

/** Same normalisation rule as the Steam matcher — an exact title, not a substring. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Looks a game up by name. Returns null unless a result's title matches
 * exactly, for the same reason the Steam path does: a substring hit is not
 * evidence the thing is that game, and wrong art is worse than no art.
 */
export async function findGogGame(name: string): Promise<GogGame | null> {
  const query = name.trim()
  if (!query) return null
  try {
    const res = await net.fetch(`${CATALOG}?limit=10&query=${encodeURIComponent(`like: ${query}`)}`)
    if (!res.ok) return null
    const body = (await res.json()) as { products?: RawProduct[] }
    const target = normalize(query)
    const match = (body.products ?? []).find((p) => normalize(p.title ?? '') === target)
    if (!match) return null
    return {
      title: match.title ?? query,
      coverVertical: match.coverVertical ?? null,
      coverHorizontal: match.galaxyBackgroundImage ?? match.coverHorizontal ?? null,
      genres: (match.genres ?? []).map((g) => g.name ?? '').filter(Boolean)
    }
  } catch {
    return null // offline, or GOG changed the endpoint — Steam-only behaviour resumes
  }
}
