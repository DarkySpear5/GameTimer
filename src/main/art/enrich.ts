import { net, nativeImage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { paths } from '../store/paths'
import { saveCappedImageBuffer } from '../util/imageResize'
import { ICON_MAX_DIMENSION, BACKGROUND_MAX_DIMENSION } from '@shared/constants'
import { fetchArt, fetchGenres } from './steamArt'
import { findGogGame } from './gogCatalog'
import { mapTagsToGenres } from './genreMap'

/**
 * One place that answers "what do we know about this game", trying sources in
 * order of quality and stopping at the first that delivers.
 *
 *   Steam  — exact appid, best art coverage, official genres
 *   GOG    — DRM-free and older titles Steam never carried
 *   giving up — the game keeps whatever the user set manually
 *
 * Both sources are keyless and accountless, which is the constraint that ruled
 * out IGDB, SteamGridDB and RAWG. Every step is best-effort: an offline machine
 * gets a game with no art, never an error.
 */

export interface Enrichment {
  iconFile: string | null
  bgImage: string | null
  genres: string[]
  /** Which source actually produced something, for logging and the UI's benefit. */
  source: 'steam' | 'gog' | 'none'
}

async function downloadUsable(url: string, minSide: number): Promise<Buffer | null> {
  try {
    const res = await net.fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0) return null
    const img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) return null
    const { width, height } = img.getSize()
    return width >= minSide && height >= minSide ? buf : null
  } catch {
    return null
  }
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

export async function enrichGame(name: string, steamAppId: number | null): Promise<Enrichment> {
  if (steamAppId != null) {
    const [art, genres] = await Promise.all([fetchArt(steamAppId, name), fetchGenres(steamAppId)])
    if (art.iconFile || art.bgImage || genres.length > 0) {
      return { ...art, genres, source: 'steam' }
    }
  }

  // GOG's images use a {formatter} placeholder on some fields but the cover
  // URLs are direct, so they can be fetched as-is.
  const gog = await findGogGame(name)
  if (!gog) return { iconFile: null, bgImage: null, genres: [], source: 'none' }

  const [icon, background] = await Promise.all([
    gog.coverVertical ? downloadUsable(gog.coverVertical, 32) : Promise.resolve(null),
    gog.coverHorizontal ? downloadUsable(gog.coverHorizontal, 200) : Promise.resolve(null)
  ])

  return {
    iconFile: icon ? await store(icon, paths.iconsDir(), ICON_MAX_DIMENSION) : null,
    bgImage: background ? await store(background, paths.backgroundsDir(), BACKGROUND_MAX_DIMENSION) : null,
    genres: mapTagsToGenres(gog.genres),
    source: 'gog'
  }
}

/**
 * Downloads one specific image the user chose and stores it like any other
 * art. Separate from enrichGame because picking is an explicit act — no
 * fallbacks, no second-guessing: if that image cannot be used, nothing changes.
 */
export async function storeArtFromUrl(url: string, kind: 'icon' | 'background'): Promise<string | null> {
  const buf = await downloadUsable(url, kind === 'icon' ? 32 : 200)
  if (!buf) return null
  return kind === 'icon'
    ? store(buf, paths.iconsDir(), ICON_MAX_DIMENSION)
    : store(buf, paths.backgroundsDir(), BACKGROUND_MAX_DIMENSION)
}
