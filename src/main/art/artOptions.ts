import { net } from 'electron'
import { searchSteamApps } from './steamArt'
import { findGogGame } from './gogCatalog'
import type { ArtOption, ArtOptions } from '@shared/types'

const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'
const STORE_API = 'https://store.steampowered.com/api/appdetails'

/**
 * Every image Gamut could plausibly use for a game, so the user picks instead
 * of being handed whichever one the fetcher ranked first. The automatic choice
 * is a good default, not a good answer — key art is a matter of taste, and
 * "it picked one I dislike" has no fix if the alternatives are discarded.
 *
 * Deliberately does not download anything: these are URLs for the picker to
 * render as thumbnails, and only the one actually chosen gets stored.
 */

async function screenshots(appId: number): Promise<ArtOption[]> {
  try {
    const res = await net.fetch(`${STORE_API}?appids=${appId}&filters=screenshots`)
    if (!res.ok) return []
    const raw = (await res.json()) as Record<
      string,
      { data?: { screenshots?: { path_full?: string; path_thumbnail?: string }[] } }
    >
    return (raw[String(appId)]?.data?.screenshots ?? [])
      .filter((s) => s.path_full)
      .slice(0, 12)
      .map((s) => ({ url: s.path_full!, thumb: s.path_thumbnail ?? s.path_full! }))
  } catch {
    return []
  }
}

export async function getArtOptions(name: string, steamAppId: number | null): Promise<ArtOptions> {
  const icons: ArtOption[] = []
  const backgrounds: ArtOption[] = []
  const add = (list: ArtOption[], url: string | null | undefined): void => {
    if (url && !list.some((o) => o.url === url)) list.push({ url, thumb: url })
  }

  if (steamAppId != null) {
    // The square community icon only exists on the search endpoint.
    const hits = await searchSteamApps(name)
    add(icons, hits.find((h) => h.appId === steamAppId)?.iconUrl ?? hits[0]?.iconUrl)

    add(icons, `${CDN}/${steamAppId}/capsule_231x87.jpg`)
    add(icons, `${CDN}/${steamAppId}/library_600x900.jpg`)
    add(icons, `${CDN}/${steamAppId}/logo.png`)
    add(icons, `${CDN}/${steamAppId}/header.jpg`)

    add(backgrounds, `${CDN}/${steamAppId}/library_hero.jpg`)
    add(backgrounds, `${CDN}/${steamAppId}/page_bg_generated_v6b.jpg`)
    add(backgrounds, `${CDN}/${steamAppId}/capsule_616x353.jpg`)
    add(backgrounds, `${CDN}/${steamAppId}/header.jpg`)
    for (const shot of await screenshots(steamAppId)) {
      if (!backgrounds.some((b) => b.url === shot.url)) backgrounds.push(shot)
    }
  }

  // GOG covers the games Steam never carried, and adds alternatives for the
  // ones it did.
  const gog = await findGogGame(name)
  if (gog) {
    add(icons, gog.coverVertical)
    add(backgrounds, gog.coverHorizontal)
  }

  return { icons, backgrounds }
}
