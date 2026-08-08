import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { TimeTab } from './ModifyDialog'

/**
 * Add/Remove time on its own, for the Timer tab's timing-only right-click menu.
 *
 * This exists because opening the Modify dialog on its Time tab was only
 * *nominally* timing-only: every other tab was still sitting right there, so a
 * menu that promised timing actions handed you the whole editor. Library owns
 * management; the Timer tab should not be a second door into it.
 *
 * It renders the very same TimeTab component the editor does, so there is one
 * implementation of adjusting time, not two that can drift.
 */
export function AdjustTimeDialog({
  name,
  onClose
}: {
  name: string
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  if (!profile) return null

  return (
    <Modal title={t('dialog_adjust_time', { name })} onClose={onClose} width="max-w-md">
      <TimeTab profile={profile} />
    </Modal>
  )
}
