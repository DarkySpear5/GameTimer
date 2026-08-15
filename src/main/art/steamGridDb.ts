import { net } from 'electron'
import { normalizeGameName } from '../detect/matchHit'

/**
 * SteamGridDB — community art for games no storefront API covers.
 *
 * This is the ONE place Gamut uses an API key, and it is a deliberate,
 * narrow exception to the "no account, no API key" rule in the roadmap's §2.2.
 * The rule exists so a shipped build never carries a secret and never depends
 * on the author's infrastructure. Neither happens here: the key is the USER'S
 * OWN, typed into Settings → Launchers by them, stored in their own save file,
 * and the feature is simply off until they provide one. Nothing is embedded in
 * the binary and nothing phones home to us.
 *
 * It runs last, after Steam and Epic, because those need no key at all — a user
 * who never enters one still gets art for almost everything.
 *
 * API shape (v2), all requiring `Authorization: Bearer <key>`:
 *   /search/autocomplete/<term>   -> [{ id, name }]
 *   /grids/game/<id>              -> 600x900 covers
 *   /heroes/game/<id>             -> wide key art, used as the background
 *   /icons/game/<id>              -> square icons
 *
 * UNVERIFIED against the live API: implemented from the documented shape
 * because no key was available while writing it. Every call is best-effort and
 * a wrong assumption degrades to "no art", never to an error — but the first
 * person with a key should confirm it actually returns images.
 */

const API = 'https://www.steamgriddb.com/api/v2'

export interface GridDbArt {
  iconUrl: string | null
  coverUrl: string | null
  backgroundUrl: string | null
}

const EMPTY: GridDbArt = { iconUrl: null, coverUrl: null, backgroundUrl: null }

async function getJson(path: string, apiKey: string): Promise<unknown | null> {
  try {
    const res = await net.fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null // offline, bad key, rate limit — all mean "no art"
  }
}

/** First image URL out of a `{ success, data: [{ url }] }` response. */
function firstUrl(payload: unknown): string | null {
  const data = (payload as { data?: unknown })?.data
  if (!Array.isArray(data)) return null
  for (const entry of data) {
    const url = (entry as { url?: unknown })?.url
    if (typeof url === 'string' && /^https:\/\//.test(url)) return url
  }
  return null
}

/**
 * Art for a title, or all-null when there is no key, no match, or no images.
 *
 * The search result is held to the same exact-title rule as Steam/GOG (§5.2)
 * — the autocomplete endpoint is a general-purpose text search across ALL of
 * SteamGridDB's entries, not scoped to "the same game", so its first result
 * for an odd or localized title (a trademark symbol, a non-English article)
 * can be a completely different, real game rather than a near-miss. Reported
 * live by the user: an EA-detected "Les Sims™ Medieval" (Sims Medieval was
 * never on Steam, so this source is what actually ran) came back with an
 * unrelated Japanese visual novel's cover. Every game in SteamGridDB's
 * catalogue being a real game only rules out the "is this even a game"
 * failure mode Steam has (§5.2's other half) — it does nothing to rule out
 * "the wrong game", which is the one that actually bit here. Falls back to
 * no art rather than wrong art, same as everywhere else.
 */
export async function fetchGridDbArt(name: string, apiKey: string): Promise<GridDbArt> {
  const key = apiKey.trim()
  if (!key || !name.trim()) return EMPTY

  const search = await getJson(`/search/autocomplete/${encodeURIComponent(name.trim())}`, key)
  const hits = Array.isArray((search as { data?: unknown })?.data)
    ? ((search as { data: unknown[] }).data as { id?: unknown; name?: unknown }[])
    : []
  const target = normalizeGameName(name)
  const match = hits.find((h) => typeof h.name === 'string' && normalizeGameName(h.name) === target)
  const gameId = typeof match?.id === 'number' ? match.id : null
  if (gameId == null) return EMPTY

  const [icons, grids, heroes] = await Promise.all([
    getJson(`/icons/game/${gameId}`, key),
    getJson(`/grids/game/${gameId}`, key),
    getJson(`/heroes/game/${gameId}`, key)
  ])

  return {
    iconUrl: firstUrl(icons),
    coverUrl: firstUrl(grids),
    backgroundUrl: firstUrl(heroes)
  }
}
