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
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className={`${rounded} h-full w-full object-cover ${className}`}
      />
    )
  }
  return (
    <div
      className={`${rounded} flex h-full w-full items-center justify-center bg-card text-2xl font-semibold text-subtext ${className}`}
    >
      {artPlaceholderLetter(profile.name)}
    </div>
  )
}
