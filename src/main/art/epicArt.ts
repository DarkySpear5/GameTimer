import { net } from 'electron'

/**
 * Epic's public storefront content, for games Steam does not list.
 *
 * Rocket League is the case that needs this: it was DELISTED from Steam when it
 * became an Epic exclusive, so the by-name Steam lookup finds nothing and the
 * game would fall back to its executable icon.
 *
 * VERIFIED keyless on 2026-08-08 — no account, no API key, no token, which is
 * the same hard constraint that ruled out IGDB, SteamGridDB and RAWG. The
 * response carries properly named art fields:
 *
 *   portraitBackgroundImageUrl   1200x1600   -> cover
 *   backgroundImageUrl           2560x1440   -> background
 *   an ic1-400x400.png                       -> square icon
 *
 * The slug is derived from the title, because Epic's own manifests record a
 * CatalogNamespace and an internal AppName ("Sugar" for Rocket League) but not
 * the store slug. "Rocket League" -> "rocket-league" resolves; anything that
 * doesn't simply 404s and the caller moves on.
 */

const CONTENT = 'https://store-content.ak.epicgames.com/api/en-US/content/products'

export interface EpicArt {
  iconUrl: string | null
  coverUrl: string | null
  backgroundUrl: string | null
}

/** Store-slug form of a title: lowercase, punctuation dropped, spaces hyphenated. */
export function epicSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Walks the response for the named art fields. The document is a CMS page tree
 * whose depth varies by product, so the fields are found by name rather than by
 * a fixed path — and rating badges (ESRB/PEGI/USK) are excluded explicitly,
 * since they are also full image URLs sitting in the same tree.
 */
function collectArt(node: unknown, found: EpicArt): void {
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === 'string') {
      if (!/^https?:\/\/\S+\.(jpg|jpeg|png)/i.test(value)) continue
      if (/esrb|pegi|usk|rating|classind|grac/i.test(value)) continue
      if (key === 'portraitBackgroundImageUrl' && !found.coverUrl) found.coverUrl = value
      else if (key === 'backgroundImageUrl' && !found.backgroundUrl) found.backgroundUrl = value
      else if (!found.iconUrl && /-ic\d*-\d+x\d+\.png$/i.test(value)) found.iconUrl = value
    } else if (typeof value === 'object') {
      collectArt(value, found)
    }
  }
}

/** Art for a title from Epic's store, or all-null when it has no page there. */
export async function fetchEpicArt(name: string): Promise<EpicArt> {
  const empty: EpicArt = { iconUrl: null, coverUrl: null, backgroundUrl: null }
  const slug = epicSlug(name)
  if (!slug) return empty

  try {
    const res = await net.fetch(`${CONTENT}/${encodeURIComponent(slug)}`)
    if (!res.ok) return empty
    const found: EpicArt = { ...empty }
    collectArt(await res.json(), found)
    return found
  } catch {
    return empty // offline, or no such product — never an error
  }
}
