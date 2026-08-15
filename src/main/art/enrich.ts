import { app, net, nativeImage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { paths } from '../store/paths'
import { saveCappedImageBuffer } from '../util/imageResize'
import { ICON_MAX_DIMENSION, BACKGROUND_MAX_DIMENSION, COVER_MAX_DIMENSION } from '@shared/constants'
import { fetchArt, fetchGenres, searchSteamApps } from './steamArt'
import { exactHit } from '../detect/matchHit'
import { findGogGame } from './gogCatalog'
import { fetchEpicArt } from './epicArt'
import { fetchGridDbArt } from './steamGridDb'
import { dataStore } from '../store/dataStore'
import { mapTagsToGenres } from './genreMap'
import { isAllowedArtUrl } from './allowedHosts'
import type { Profile } from '@shared/types'

/**
 * One place that answers "what do we know about this game", trying sources in
 * order of quality and stopping at the first that delivers.
 *
 *   Steam  — by appid when known, otherwise by exact title, since a game bought
 *            on Epic or Xbox is usually still LISTED on Steam. Best coverage.
 *   GOG    — DRM-free and older titles Steam never carried
 *   SteamGridDB — community art, ONLY if the user supplied their own API key
 *   the .exe — its own icon, for a game no storefront lists at all (Rocket
 *            League was delisted from Steam; Heroes of the Storm never was on it)
 *   giving up — the game keeps whatever the user set manually
 *
 * Every source above SteamGridDB is keyless and accountless — the constraint
 * that ruled out IGDB and RAWG entirely. SteamGridDB is the single exception
 * and a narrow one: the key is the USER'S OWN, typed into Settings, and the
 * source is skipped entirely until they enter one. Nothing is shipped in the
 * binary. See the note at the top of steamGridDb.ts.
 *
 * Every step is best-effort: an offline machine gets a game with no art, never
 * an error.
 */

export interface Enrichment {
  iconFile: string | null
  bgImage: string | null
  /** Portrait box art for the Library grid. Null whenever no source had one. */
  coverFile: string | null
  genres: string[]
  /** Which source actually produced something, for logging and the UI's benefit. */
  source: 'steam' | 'epic' | 'gog' | 'steamgriddb' | 'exe' | 'none'
}

/**
 * Real box art is roughly 0.6–0.75 width/height (Steam's own library_600x900
 * is exactly 2:3). 1.1 is deliberately lenient — it only needs to catch the
 * cases that measurably look bad in the Library grid's portrait tiles: Steam's
 * `header.jpg` last-resort fallback (460x215, height/width 0.47 — appid 3600,
 * a 2007 game with no library_600x900 at all) and a bare square community
 * icon standing in for a missing cover entirely (Heroes of the Storm, never
 * listed on any storefront). Anything at or above this ratio is left alone.
 */
export const PORTRAIT_MIN_RATIO = 1.1

/** Kept free of electron/fs so the actual decision is unit-testable without a real image file. */
export function isPortraitRatio(width: number, height: number): boolean {
  return height >= width * PORTRAIT_MIN_RATIO
}

async function isPortraitFile(coverFile: string | null): Promise<boolean> {
  if (!coverFile) return false
  try {
    const buf = await fs.readFile(join(paths.coversDir(), coverFile))
    const { width, height } = nativeImage.createFromBuffer(buf).getSize()
    return isPortraitRatio(width, height)
  } catch {
    return false
  }
}

/**
 * One extra SteamGridDB lookup for JUST a better cover, tried after whichever
 * primary source above already resolved everything else — never instead of
 * it. SteamGridDB exists specifically to provide properly-shaped portrait
 * grid art, which makes it worth a second, targeted request exactly when the
 * primary source's cover isn't good enough for the grid, rather than only
 * ever being tried as a last resort when every other source came up empty.
 *
 * Deliberately narrow: only the cover is replaced. The primary source's icon,
 * background and genres are left as they are — SteamGridDB has no genre data
 * at all, and there's no evidence its icons/backgrounds are more reliable
 * than what Steam/Epic/GOG already provided.
 */
async function supplementCoverIfNeeded(result: Enrichment, name: string): Promise<Enrichment> {
  if (result.source === 'steamgriddb') return result // already the best this app can do
  const apiKey = dataStore.get().settings.steamGridDbApiKey
  if (!apiKey) return result
  if (await isPortraitFile(result.coverFile)) return result

  const gridArt = await fetchGridDbArt(name, apiKey)
  if (!gridArt.coverUrl) return result
  const buf = await downloadUsable(gridArt.coverUrl, 100)
  if (!buf) return result
  const { width, height } = nativeImage.createFromBuffer(buf).getSize()
  if (!isPortraitRatio(width, height)) return result // no better than what's already there

  const coverFile = await store(buf, paths.coversDir(), COVER_MAX_DIMENSION)
  return coverFile ? { ...result, coverFile } : result
}

/**
 * The game's own executable icon — the last resort, and the only source that
 * works for a game no storefront lists.
 *
 * Measured need: Rocket League was DELISTED from Steam when it went
 * Epic-exclusive, and Heroes of the Storm was never on Steam at all. Neither
 * launcher caches usable art locally either (Epic's ContentCache holds sale
 * banners; the Heroes install ships no icons). Their executables do have icons,
 * and a real game icon beats a lettered placeholder.
 *
 * Gives an icon only — an .exe has no cover or background — so those games
 * still show a plain tile in the grid, which is honest.
 */
async function iconFromExecutable(exePath: string | null): Promise<string | null> {
  if (!exePath) return null
  try {
    const image = await app.getFileIcon(exePath, { size: 'large' })
    if (image.isEmpty()) return null
    return store(image.toPNG(), paths.iconsDir(), ICON_MAX_DIMENSION, '.png')
  } catch {
    return null
  }
}

/**
 * The Steam appid for a game we only know by name, or null when Steam's
 * catalogue does not contain that exact title. Best-effort: offline, or a game
 * Steam has never listed, simply returns null and the GOG fallback runs.
 */
async function resolveAppIdByName(name: string): Promise<number | null> {
  try {
    return exactHit(name, await searchSteamApps(name))?.appId ?? null
  } catch {
    return null
  }
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

/**
 * `ext` matters more than it looks: saveCappedImageBuffer picks its output
 * format from the filename, and an icon written as .jpg loses its alpha channel
 * to a black box. Downloaded store art is opaque photography and stays .jpg;
 * an executable's icon must be .png.
 */
async function store(buf: Buffer, dir: string, max: number, ext = '.jpg'): Promise<string | null> {
  try {
    await fs.mkdir(dir, { recursive: true })
    const name = `${randomUUID()}${ext}`
    await saveCappedImageBuffer(buf, join(dir, name), max)
    return name
  } catch {
    return null
  }
}

export async function enrichGame(
  name: string,
  steamAppId: number | null,
  exePath: string | null = null
): Promise<Enrichment> {
  // A game from Epic, Xbox, Battle.net, EA or Nexon has no appid, but it is
  // almost always LISTED on Steam even when it isn't bought there — and Steam's
  // art is by far the best source available without an API key. So the appid is
  // resolved from the name when one wasn't supplied.
  //
  // Strictly an exact normalised title match (§5.2): searching "Discord"
  // returns Discord Bot Maker and "Hollow Knight" returns Silksong first, so
  // anything looser would dress a game up in another game's box art.
  //
  // Deliberately used for ART ONLY and never written back as the profile's
  // steamAppId. That field decides how the game LAUNCHES — adopting it would
  // make Gamut try to start the Steam copy of a game the user owns on Epic.
  const artAppId = steamAppId ?? (await resolveAppIdByName(name))

  if (artAppId != null) {
    const [art, genres] = await Promise.all([fetchArt(artAppId, name), fetchGenres(artAppId)])
    if (art.iconFile || art.bgImage || art.coverFile || genres.length > 0) {
      return await supplementCoverIfNeeded({ ...art, genres, source: 'steam' }, name)
    }
  }

  // Epic's storefront, for the games Steam genuinely does not have — Rocket
  // League was delisted from Steam when it went Epic-exclusive. Keyless, so it
  // costs the user nothing and runs before any key-requiring source.
  const epic = await fetchEpicArt(name)
  if (epic.iconUrl || epic.coverUrl || epic.backgroundUrl) {
    const [icon, cover, background] = await Promise.all([
      epic.iconUrl ? downloadUsable(epic.iconUrl, 32) : Promise.resolve(null),
      epic.coverUrl ? downloadUsable(epic.coverUrl, 100) : Promise.resolve(null),
      epic.backgroundUrl ? downloadUsable(epic.backgroundUrl, 200) : Promise.resolve(null)
    ])
    if (icon || cover || background) {
      return await supplementCoverIfNeeded(
        {
          iconFile: icon ? await store(icon, paths.iconsDir(), ICON_MAX_DIMENSION) : null,
          bgImage: background
            ? await store(background, paths.backgroundsDir(), BACKGROUND_MAX_DIMENSION)
            : null,
          coverFile: cover ? await store(cover, paths.coversDir(), COVER_MAX_DIMENSION) : null,
          genres: [],
          source: 'epic'
        },
        name
      )
    }
  }

  // GOG's images use a {formatter} placeholder on some fields but the cover
  // URLs are direct, so they can be fetched as-is.
  const gog = await findGogGame(name)
  if (!gog) {
    // SteamGridDB last of the online sources, because it is the only one that
    // needs a key. A user who never enters one still gets art for nearly
    // everything from Steam and Epic above.
    const gridArt = await fetchGridDbArt(name, dataStore.get().settings.steamGridDbApiKey)
    if (gridArt.iconUrl || gridArt.coverUrl || gridArt.backgroundUrl) {
      const [icon, cover, background] = await Promise.all([
        gridArt.iconUrl ? downloadUsable(gridArt.iconUrl, 32) : Promise.resolve(null),
        gridArt.coverUrl ? downloadUsable(gridArt.coverUrl, 100) : Promise.resolve(null),
        gridArt.backgroundUrl ? downloadUsable(gridArt.backgroundUrl, 200) : Promise.resolve(null)
      ])
      if (icon || cover || background) {
        return {
          iconFile: icon ? await store(icon, paths.iconsDir(), ICON_MAX_DIMENSION) : null,
          bgImage: background
            ? await store(background, paths.backgroundsDir(), BACKGROUND_MAX_DIMENSION)
            : null,
          coverFile: cover ? await store(cover, paths.coversDir(), COVER_MAX_DIMENSION) : null,
          genres: [],
          source: 'steamgriddb'
        }
      }
    }

    const iconFile = await iconFromExecutable(exePath)
    return {
      iconFile,
      bgImage: null,
      coverFile: null,
      genres: [],
      source: iconFile ? 'exe' : 'none'
    }
  }

  const [icon, background] = await Promise.all([
    gog.coverVertical ? downloadUsable(gog.coverVertical, 32) : Promise.resolve(null),
    gog.coverHorizontal ? downloadUsable(gog.coverHorizontal, 200) : Promise.resolve(null)
  ])

  return await supplementCoverIfNeeded(
    {
      iconFile: icon ? await store(icon, paths.iconsDir(), ICON_MAX_DIMENSION) : null,
      bgImage: background ? await store(background, paths.backgroundsDir(), BACKGROUND_MAX_DIMENSION) : null,
      // GOG's coverVertical is already the portrait poster, so the cover and the
      // icon come from one download stored twice at two different caps. GOG
      // exposes nothing square, and a 480px poster is not an acceptable icon.
      // (Already portrait in practice, so supplementCoverIfNeeded below is a
      // no-op here — kept anyway for the rare case GOG has no cover at all.)
      coverFile: icon ? await store(icon, paths.coversDir(), COVER_MAX_DIMENSION) : null,
      genres: mapTagsToGenres(gog.genres),
      source: 'gog'
    },
    name
  )
}

/**
 * Downloads one specific image the user chose and stores it like any other
 * art. Separate from enrichGame because picking is an explicit act — no
 * fallbacks, no second-guessing: if that image cannot be used, nothing changes.
 */
export async function storeArtFromUrl(url: string, kind: 'icon' | 'background'): Promise<string | null> {
  // The URL arrives from the renderer. It should only ever be one this app
  // produced, but main fetching whatever it is handed is a request-forgery
  // primitive, so the host is checked rather than assumed.
  if (!isAllowedArtUrl(url)) return null
  const buf = await downloadUsable(url, kind === 'icon' ? 32 : 200)
  if (!buf) return null
  return kind === 'icon'
    ? store(buf, paths.iconsDir(), ICON_MAX_DIMENSION)
    : store(buf, paths.backgroundsDir(), BACKGROUND_MAX_DIMENSION)
}

/**
 * Fire-and-forget, called once at startup: retries art for every profile
 * with no cover at all yet, the same way linkExecutable/createDetected
 * already do at add-time — for a game added before a fix landed (a Battle.net
 * game before battleNetLaunchUri existed, a newer Steam game before the
 * store-image fallback, or simply added before a SteamGridDB key was ever
 * entered), that add-time attempt is the only one it ever gets otherwise.
 *
 * Deliberately narrow, same reasoning as linkExecutable: only `coverFile ===
 * null` counts as "try again" — a profile with SOME cover, even a
 * non-portrait fallback, might be one the user picked on purpose (Modify →
 * Appearance's manual chooser writes to the same field), and this must never
 * silently replace that. Missing-entirely is the one unambiguous "nothing to
 * lose" signal. Whatever's found only fills in fields still null, exactly
 * like every other art-fetch path in this app — never overwrites.
 *
 * Sequential, not parallel: enrichGame makes several network requests per
 * game, and this runs unattended on every launch — gentler on whichever
 * remote API is involved, at the cost of taking a little longer for a
 * library with several such games. Nothing else waits on it.
 *
 * `onProfileUpdated` fires once per game that actually got something new —
 * dataStore writes are invisible to the renderer's own profile cache on
 * their own (same gap gameWatcher's broadcastProfiles exists to close for
 * its own background mutations), so without this the Library grid would
 * only pick up the new art after a manual reload, which defeats the point
 * of doing this automatically in the first place.
 */
export async function backfillMissingCoverArt(
  onProfileUpdated?: (profile: Profile) => void
): Promise<void> {
  const data = dataStore.get()
  const candidates = Object.values(data.profiles).filter((p) => {
    const wantsArt = p.autoFetchArt ?? data.settings.autoFetchArt
    return wantsArt && !p.coverFile
  })
  if (candidates.length === 0) return

  for (const profile of candidates) {
    const found = await enrichGame(profile.name, profile.steamAppId, profile.exePath)
    let touched = false
    if (found.iconFile && !profile.iconFile) {
      profile.iconFile = found.iconFile
      touched = true
    }
    if (found.bgImage && !profile.bgImage) {
      profile.bgImage = found.bgImage
      touched = true
    }
    if (found.coverFile && !profile.coverFile) {
      profile.coverFile = found.coverFile
      touched = true
    }
    if (found.genres.length > 0 && profile.genres.length === 0) {
      profile.genres = found.genres
      profile.genresFromDetection = true
      touched = true
    }
    // Saved and reported per-profile, not batched at the end — this can take
    // a while for a library with several such games, and the point is
    // letting the grid update as each one actually arrives, not making the
    // user wait for the whole run before seeing anything.
    if (touched) {
      await dataStore.safeSave()
      onProfileUpdated?.(profile)
    }
  }
}
