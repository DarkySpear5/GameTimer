import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'

/**
 * The star, everywhere it appears. Toggling goes straight to main and the
 * returned profile is upserted, so the grid, the list and the detail page all
 * update from one source rather than each keeping their own optimistic copy.
 */
export function FavoriteStar({
  name,
  favorite,
  size = 18,
  className = ''
}: {
  name: string
  favorite: boolean
  size?: number
  className?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const label = t(favorite ? 'ctx_favorite_remove' : 'ctx_favorite_add')

  async function toggle(e: React.MouseEvent): Promise<void> {
    // The star sits on top of a tile that is itself a button. Without this, a
    // click would star the game AND open its detail page.
    e.stopPropagation()
    e.preventDefault()
    useProfilesStore.getState().upsert(await window.api.profiles.setFavorite(name, !favorite))
  }

  return (
    <button
      onClick={(e) => void toggle(e)}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-full transition-colors ${
        favorite ? 'text-gold' : 'text-subtext hover:text-gold'
      } ${className}`}
      style={{ width: size + 10, height: size + 10 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={favorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z" />
      </svg>
    </button>
  )
}
