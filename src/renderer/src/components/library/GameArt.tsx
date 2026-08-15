import { useState } from 'react'
import type { Profile } from '@shared/types'

/**
 * The art a game shows in the Library, with the fallback chain in one place so
 * the grid, the list and the detail header can never disagree about which
 * image a game has.
 *
 * Order matters and is a memory decision as much as a visual one:
 *
 *   coverFile — portrait box art, capped at COVER_MAX_DIMENSION (480px)
 *   iconFile  — the square community icon, capped at 256px
 *   neither   — a lettered placeholder, no image at all
 *
 * `bgImage` is deliberately absent. It is capped at 2560px because it fills a
 * whole pane on its own, and the grid is the first view in this app that puts
 * every game's art on screen at once — forty decoded backgrounds would cost
 * hundreds of megabytes. A background belongs behind one game, never in a tile.
 */
export function gameArtUrl(profile: Profile, preferIcon = false): string | null {
  const cover = profile.coverFile ? `gt-asset://covers/${encodeURIComponent(profile.coverFile)}` : null
  const icon = profile.iconFile ? `gt-asset://icons/${encodeURIComponent(profile.iconFile)}` : null
  // A list row is a small square, so the square icon wins there; a grid tile is
  // a portrait frame, so the poster wins there. Each falls back to the other.
  return preferIcon ? (icon ?? cover) : (cover ?? icon)
}

/** First character of the name, for a game with no art at all. */
export function artPlaceholderLetter(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}

/**
 * Real box art is roughly 0.6–0.75 width/height. 1.1 is deliberately lenient
 * — it only needs to catch what actually measured badly here: Steam's
 * `header.jpg` last-resort fallback (460x215, a landscape capsule) and a bare
 * square community icon standing in for a missing cover (48x48) — both found
 * live on real games (Escape Rosecliff Island, Heroes of the Storm) forced
 * into the grid's portrait tiles via object-cover, cropped and blown up past
 * their real resolution. Kept in sync with enrich.ts's own PORTRAIT_MIN_RATIO
 * — this is the same judgment call, just applied to whatever a profile
 * already has on disk instead of deciding what to fetch in the first place.
 */
const PORTRAIT_MIN_RATIO = 1.1

/**
 * Letterboxing fixed the CROP problem (wrong-shaped art getting hacked down
 * to fit) but not a separate one underneath it: an image can be the right
 * shape and still be too few actual pixels to look good stretched up to grid
 * size. Reported live, still pixelated after a fresh re-fetch — an EA game
 * (`gameArtUrl`'s `cover ?? icon` fallback) whose `coverFile` never got
 * filled in was showing its small square `iconFile` letterboxed into a
 * ~150-400px portrait tile, several times its native size.
 *
 * 100 isn't a new number invented for this — it's the exact `minSide` every
 * cover-specific download in enrich.ts/steamArt.ts already requires
 * (`downloadUsable(url, 100)`, `firstUsable(coverUrls, 100, 4)`) before
 * accepting an image as cover-quality at all. Anything smaller than that on
 * either axis was never validated as fit to be a cover, whether it arrived
 * as one or is standing in for a missing one — so it gets the same "nothing
 * beats no art" treatment as a missing file, rather than a stretched blur.
 */
const MIN_GOOD_SIDE = 100

export function GameArt({
  profile,
  className = '',
  rounded = 'rounded-lg',
  preferIcon = false
}: {
  profile: Profile
  className?: string
  rounded?: string
  /** List rows pass true: a square icon reads better than a cropped poster. */
  preferIcon?: boolean
}): React.JSX.Element {
  const url = gameArtUrl(profile, preferIcon)
  // Both reset whenever the art itself changes (re-fetch, manual pick) — the
  // <img> below is keyed on `url`, so a new one remounts and re-fires onLoad
  // from scratch rather than these getting stuck at a stale image's verdict.
  // letterbox starts optimistic (plain cover-fit) so a real portrait cover,
  // the common case, never pays for the blurred backdrop it doesn't need.
  const [letterbox, setLetterbox] = useState(false)
  const [tooSmall, setTooSmall] = useState(false)

  if (!url || tooSmall) {
    return (
      <div
        className={`${rounded} flex h-full w-full items-center justify-center bg-card text-2xl font-semibold text-subtext ${className}`}
      >
        {artPlaceholderLetter(profile.name)}
      </div>
    )
  }

  // A list row is already a square tile matched to a square icon — nothing to
  // letterbox OR reject-as-too-small there even in the rare case it falls
  // back to a landscape cover instead: a square frame never stretches a
  // properly-sized icon past its native resolution the way a portrait grid
  // tile several times its size does. Only the grid/detail's portrait frame
  // needs either check.
  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>): void {
    if (preferIcon) return
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (naturalWidth < MIN_GOOD_SIDE || naturalHeight < MIN_GOOD_SIDE) {
      setTooSmall(true)
      return
    }
    setLetterbox(naturalHeight < naturalWidth * PORTRAIT_MIN_RATIO)
  }

  return (
    <div className={`${rounded} relative h-full w-full overflow-hidden bg-card ${className}`}>
      {letterbox && (
        <img
          src={url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-lg"
        />
      )}
      <img
        key={url}
        src={url}
        alt=""
        loading="lazy"
        onLoad={handleLoad}
        className={`relative h-full w-full ${letterbox ? 'object-contain' : 'object-cover'}`}
      />
    </div>
  )
}
