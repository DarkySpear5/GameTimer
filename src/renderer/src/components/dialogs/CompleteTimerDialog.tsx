import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { useTimeFormat } from '../../state/useTimeFormat'
import { formatSeconds } from '@shared/format'

/**
 * Only ever opened when the game has ≥1 sub-category — see toggleComplete in
 * LibraryDetail.tsx. Picks which timer's CURRENT total becomes statusSeconds;
 * "Main" passes no override (today's exact existing behavior: profileService
 * reads profile.seconds itself, after its own pause()).
 */
export function CompleteTimerDialog({
  name,
  onClose
}: {
  name: string
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  const timeFormat = useTimeFormat()

  if (!profile) return null

  async function complete(overrideSeconds?: number): Promise<void> {
    useProfilesStore
      .getState()
      .upsert(await window.api.profiles.setStatus(name, 'completed', overrideSeconds))
    onClose()
  }

  return (
    <Modal title={t('complete_timer_picker_title')} onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => void complete(undefined)}
          className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-left text-sm text-text hover:bg-panel"
        >
          <span>{t('complete_timer_picker_main')}</span>
          <span className="tabular-nums text-subtext">{formatSeconds(profile.seconds, timeFormat)}</span>
        </button>
        {profile.subCategories.map((c) => (
          <button
            key={c.id}
            onClick={() => void complete(c.seconds)}
            className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-left text-sm text-text hover:bg-panel"
          >
            <span>{c.name}</span>
            <span className="tabular-nums text-subtext">{formatSeconds(c.seconds, timeFormat)}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
