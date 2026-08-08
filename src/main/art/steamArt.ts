import { net, nativeImage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { paths } from '../store/paths'
import { saveCappedImageBuffer } from '../util/imageResize'
import { ICON_MAX_DIMENSION, BACKGROUND_MAX_DIMENSION, COVER_MAX_DIMENSION } from '@shared/constants'
import { mapTagsToGenres } from './genreMap'
import type { GameSearchHit } from '@shared/types'

/**
 * Steam's public art, search and store endpoints. All keyless: no account, no
 * API key, no server of our own. That is the entire reason this exists rather
 * than an IGDB integration — IGDB requires a Twitch client secret, which
 * cannot be shipped inside an app, and its own docs say desktop clients should
 * not call it directly.
 */
const SEARCH_URL = 'https://steamcommunity.com/actions/SearchApps/'
const STORE_API = 'https://store.steampowered.com/api/appdetails'
const STEAMSPY_API = 'https://steamspy.com/api.php'
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'

interface RawHit {
  appid?: string | number
  name?: string
  icon?: string
}

/**
 * Fuzzy name search. Tolerates typos and pluralisation — "field of mistria"
 * correctly returns "Fields of Mistria".
 *
 * Results are a suggestion, never a fact: it is a SUBSTRING matcher whose
 * first result is often wrong ("Hollow Knight" returns Silksong first), and it
 * returns hits for things that are not games at all ("Discord" returns Discord
 * Bot Maker). See matchHit.ts — an exact title match is the real signal.
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
      .map((h) => ({ appId: Number(h.appid), name: String(h.name ?? ''), iconUrl: h.icon })
      )
      .filter((h) => Number.isFinite(h.appId) && h.appId > 0 && h.name)
      .slice(0, 12)
  } catch {
    return [] // offline is a normal outcome here, not an error worth surfacing
  }
}

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

/**
 * Rejects anything that downloaded but isn't usable art. Steam answers a
 * missing asset with a tiny placeholder rather than a clean 404 on some CDN
 * edges, and a 1x1 or undecodable image saved as a game's icon looks like a
 * bug in Gamut rather than a gap in Steam's catalogue.
 *
 * `maxAspect` is the real quality gate: it is what stops a wide banner being
 * saved as a square icon, which is precisely how the first version went wrong.
 */
function isUsable(buf: Buffer, minSide: number, maxAspect: number): boolean {
  const img = nativeImage.createFromBuffer(buf)
  if (img.isEmpty()) return false
  const { width, height } = img.getSize()
  if (width < minSide || height < minSide) return false
  const aspect = Math.max(width / height, height / width)
  return aspect <= maxAspect
}

/** First candidate that downloads AND passes the quality gate. */
async function firstUsable(urls: string[], minSide: number, maxAspect: number): Promise<Buffer | null> {
  for (const url of urls) {
    const buf = await download(url)
    if (buf && isUsable(buf, minSide, maxAspect)) return buf
  }
  return null
}

async function store(buf: Buffer, dir: string, max: number): Promise<string | null> {
  try {
    await fs.mkdir(dir, { recursive: true })
    const name = `${randomUUID()}.jpg`
    await saveCappedImageBuffer(buf, join(dir, name), max)
    return name
  } catch {
    return null
  }
}

export interface FetchedArt {
  iconFile: string | null
  bgImage: string | null
  coverFile: string | null
}

/**
 * Downloads a game's icon and background, storing them exactly where manually
 * chosen art goes and through the same size caps.
 *
 * Both halves use a fallback chain, because Steam's asset coverage is uneven:
 * `library_600x900` and `library_hero` simply do not exist for older titles —
 * appid 3600 (a 2007 game) 404s on both but serves `header.jpg` fine, and
 * fetching nothing at all was the visible result.
 *
 * The icon deliberately prefers the community square icon from the search
 * endpoint over any of the store artwork. The first version used
 * `library_600x900`, which is tall portrait box art: cropped into a square
 * tile it reads as a random slice of a poster rather than a game icon.
 */
export async function fetchArt(appId: number, name?: string): Promise<FetchedArt> {
  // The square icon URL is only available through search, so look it up by the
  // name we already resolved. One request, and it is the only source of a
  // genuinely square icon.
  let squareIconUrl: string | undefined
  if (name) {
    const hits = await searchSteamApps(name)
    squareIconUrl = hits.find((h) => h.appId === appId)?.iconUrl ?? hits[0]?.iconUrl
  }

  const [icon, background, cover] = await Promise.all([
    firstUsable(
      [
        ...(squareIconUrl ? [squareIconUrl] : []),
        `${CDN}/${appId}/capsule_231x87.jpg`,
        `${CDN}/${appId}/header.jpg`
      ],
      // Aspect 3 tolerates the wide capsule fallbacks, which are still far
      // better than no icon; the square community icon wins whenever it exists.
      32,
      3
    ),
    firstUsable(
      [`${CDN}/${appId}/library_hero.jpg`, `${CDN}/${appId}/capsule_616x353.jpg`, `${CDN}/${appId}/header.jpg`],
      200,
      4
    ),
    // The portrait box art the Library grid wants, and the one case where
    // library_600x900 is the right choice rather than the wrong one — it is a
    // poster, so it belongs in a poster-shaped tile, not cropped into a square
    // icon. header.jpg is a deliberate last resort: wide art centre-cropped
    // into a tall tile still reads as the game, and appid 3600 proves that
    // 600x900 simply does not exist for older titles.
    firstUsable([`${CDN}/${appId}/library_600x900.jpg`, `${CDN}/${appId}/header.jpg`], 100, 4)
  ])

  return {
    iconFile: icon ? await store(icon, paths.iconsDir(), ICON_MAX_DIMENSION) : null,
    bgImage: background ? await store(background, paths.backgroundsDir(), BACKGROUND_MAX_DIMENSION) : null,
    coverFile: cover ? await store(cover, paths.coversDir(), COVER_MAX_DIMENSION) : null
  }
}

/** Steam's user tags, ranked by how many players applied them. Keyless. */
async function fetchSteamSpyTags(appId: number): Promise<string[]> {
  try {
    const res = await net.fetch(`${STEAMSPY_API}?request=appdetails&appid=${appId}`)
    if (!res.ok) return []
    const raw = (await res.json()) as { tags?: Record<string, number> | unknown[] }
    // An untagged game returns an empty ARRAY here rather than an empty object.
    return Array.isArray(raw.tags) ? [] : Object.keys(raw.tags ?? {})
  } catch {
    return []
  }
}

/** Steam's store genres. Coarse — DOOM Eternal is just "Action" — so only a fallback. */
async function fetchStoreGenres(appId: number): Promise<string[]> {
  try {
    const res = await net.fetch(`${STORE_API}?appids=${appId}&filters=genres`)
    if (!res.ok) return []
    const raw = (await res.json()) as Record<string, { data?: { genres?: { description?: string }[] } }>
    return (raw[String(appId)]?.data?.genres ?? []).map((g) => g.description ?? '').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * User tags first, store genres second. The difference is not marginal:
 * store genres call DOOM Eternal "Action" and nothing else, while its user
 * tags are FPS, Action, Gore, Shooter, Sci-fi — the same words a person would
 * pick, and the same vocabulary Gamut's genre list already uses.
 */
export async function fetchGenres(appId: number): Promise<string[]> {
  const tags = await fetchSteamSpyTags(appId)
  const fromTags = mapTagsToGenres(tags)
  if (fromTags.length > 0) return fromTags
  return mapTagsToGenres(await fetchStoreGenres(appId))
}
