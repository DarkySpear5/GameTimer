import { net } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { paths } from '../store/paths'
import { saveCappedImageBuffer } from '../util/imageResize'
import { ICON_MAX_DIMENSION, BACKGROUND_MAX_DIMENSION } from '@shared/constants'
import type { GameSearchHit } from '@shared/types'

/**
 * Steam's public art and search endpoints. Both are keyless: no account, no
 * API key, no server of our own. That is the entire reason this exists rather
 * than an IGDB integration — IGDB requires a Twitch client secret, which
 * cannot be shipped inside an app, and its own docs say desktop clients should
 * not call it directly.
 *
 * A game does not need to be installed through Steam for any of this, only
 * listed in Steam's catalogue — which covers the overwhelming majority of PC
 * games including Epic, GOG and itch releases.
 */
const SEARCH_URL = 'https://steamcommunity.com/actions/SearchApps/'
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'

interface RawHit {
  appid?: string | number
  name?: string
}

/**
 * Fuzzy name search. Tolerates typos and pluralisation — "field of mistria"
 * correctly returns "Fields of Mistria".
 *
 * Callers must treat results as a suggestion, never a fact: the search fails
 * *closed* on nonsense (SMAPI, BootstrapPackagedGame all return nothing) but
 * fails *open* on plausible input — "MarvelRivals" confidently returns
 * "Marvel Rivals Playtest", the wrong app entirely.
 */
export async function searchSteamApps(query: string): Promise<GameSearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  try {
    const res = await net.fetch(SEARCH_URL + encodeURIComponent(trimmed))
    if (!res.ok) return []
    const raw: unknown = await res.json()
    if (!Array.isArray(raw)) return []
    return (raw as RawHit[])
      .map((h) => ({ appId: Number(h.appid), name: String(h.name ?? '') }))
      .filter((h) => Number.isFinite(h.appId) && h.appId > 0 && h.name)
      .slice(0, 12)
  } catch {
    return [] // offline is a normal outcome here, not an error worth surfacing
  }
}

/** Cover art URL — also what the picker shows for a confirmation prompt. */
export function coverUrl(appId: number): string {
  return `${CDN}/${appId}/library_600x900.jpg`
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await net.fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.byteLength > 0 ? buf : null
  } catch {
    return null
  }
}

export interface FetchedArt {
  iconFile: string | null
  bgImage: string | null
}

/**
 * Downloads a game's cover and hero image and stores them exactly where
 * manually chosen art goes, through the same size caps — so nothing
 * downstream needs to know an image was fetched rather than picked.
 *
 * Each half is independent: a game with a cover but no hero image still gets
 * its cover. Returning nulls is a normal outcome (offline, or an appid with no
 * art), never an exception.
 */
export async function fetchArt(appId: number): Promise<FetchedArt> {
  const [cover, hero] = await Promise.all([
    download(coverUrl(appId)),
    download(`${CDN}/${appId}/library_hero.jpg`)
  ])

  let iconFile: string | null = null
  let bgImage: string | null = null

  if (cover) {
    try {
      await fs.mkdir(paths.iconsDir(), { recursive: true })
      const name = `${randomUUID()}.jpg`
      await saveCappedImageBuffer(cover, join(paths.iconsDir(), name), ICON_MAX_DIMENSION)
      iconFile = name
    } catch {
      /* keep going — a failed write should not cost the background too */
    }
  }
  if (hero) {
    try {
      await fs.mkdir(paths.backgroundsDir(), { recursive: true })
      const name = `${randomUUID()}.jpg`
      await saveCappedImageBuffer(hero, join(paths.backgroundsDir(), name), BACKGROUND_MAX_DIMENSION)
      bgImage = name
    } catch {
      /* as above */
    }
  }

  return { iconFile, bgImage }
}
