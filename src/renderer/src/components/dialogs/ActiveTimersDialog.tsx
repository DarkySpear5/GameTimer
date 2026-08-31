import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { useTimerStore } from '../../state/timerStore'
import { useTimeFormat } from '../../state/useTimeFormat'
import { formatSeconds } from '@shared/format'

/**
 * Every profile with a timer running right now, anywhere in the library —
 * not scoped to whichever game's detail page happens to be open, since the
 * whole point is seeing (and pausing) timers you're NOT currently looking
 * at. Live seconds come straight from timerStore's tick payload, same
 * source LibraryDetail's own display already uses.
 */
export function ActiveTimersDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const running = useTimerStore((s) => s.running)
  const profiles = useProfilesStore((s) => s.profiles)
  const timeFormat = useTimeFormat()
  const names = Object.keys(running).sort((a, b) => a.localeCompare(b))

  async function pause(name: string): Promise<void> {
    await window.api.timer.pause(name)
    useProfilesStore.getState().setAll(await window.api.profiles.list())
  }

  return (
    <Modal title={t('active_timers_title')} onClose={onClose}>
      {names.length === 0 ? (
        <div className="py-4 text-center text-sm text-subtext">{t('active_timers_empty')}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {names.map((name) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm text-text"
            >
              <span className="min-w-0 truncate">{profiles[name]?.name ?? name}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tabular-nums text-subtext">{formatSeconds(running[name], timeFormat)}</span>
                <button onClick={() => void pause(name)} className="text-xs text-accent hover:underline">
                  {t('btn_pause')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
