import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { useTimerStore } from '../../state/timerStore'
import { useUiStore } from '../../state/uiStore'
import { useSettingsStore } from '../../state/settingsStore'
import { formatSeconds } from '@shared/format'
import type { Status } from '@shared/types'

// Retro Terminal's "hacked" green wash — kept in one place since it needs to
// layer into whatever backgroundImage/backgroundColor a game already has
// (see backgroundStyle below), not just sit on top of it as a separate CSS
// rule, or it'd either get overridden by or hide the actual custom
// background depending on cascade order.
const RETRO_WASH = 'linear-gradient(rgba(51, 255, 102, 0.16), rgba(51, 255, 102, 0.16))'

export function SelectedGameView(): React.JSX.Element {
  const { t } = useTranslation()
  const selected = useUiStore((s) => s.selected)
  const profile = useProfilesStore((s) => (selected ? s.profiles[selected] : null))
  const running = useTimerStore((s) => s.running)
  const isRetroTheme = useSettingsStore((s) => s.settings?.theme === 'Retro Terminal')

  const STATUS_LABEL: Record<Status, string> = {
    in_progress: t('status_paused'),
    completed: t('status_completed'),
    dropped: t('status_dropped'),
    on_hold: t('status_on_hold')
  }

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-subtext">{t('canvas_no_profile_selected')}</div>
      </div>
    )
  }

  const isRunning = profile.name in running
  const seconds = running[profile.name] ?? profile.seconds

  async function togglePlay(): Promise<void> {
    if (isRunning) await window.api.timer.pause(profile!.name)
    else await window.api.timer.start(profile!.name)
    useProfilesStore.getState().setAll(await window.api.profiles.list())
  }

  async function toggleComplete(): Promise<void> {
    const nextStatus: Status = profile!.status === 'completed' ? 'in_progress' : 'completed'
    useProfilesStore.getState().upsert(await window.api.profiles.setStatus(profile!.name, nextStatus))
  }

  const backgroundStyle: CSSProperties = profile.bgImage
    ? {
        backgroundImage: isRetroTheme
          ? `${RETRO_WASH}, url(gt-asset://backgrounds/${encodeURIComponent(profile.bgImage)})`
          : `url(gt-asset://backgrounds/${encodeURIComponent(profile.bgImage)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        ...(isRetroTheme ? { backgroundBlendMode: 'color' } : {})
      }
    : profile.bgColor
      ? {
          backgroundColor: profile.bgColor,
          ...(isRetroTheme ? { backgroundImage: RETRO_WASH, backgroundBlendMode: 'color' } : {})
        }
      : isRetroTheme
        ? { backgroundImage: RETRO_WASH, backgroundBlendMode: 'color' }
        : {}

  const hasCustomBackground = !!(profile.bgImage || profile.bgColor)

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden"
      style={backgroundStyle}
    >
      <div
        className={`relative z-10 flex flex-col items-center gap-3 ${hasCustomBackground ? 'rounded-2xl px-12 py-9' : ''}`}
        style={hasCustomBackground ? { backgroundColor: 'rgba(15, 15, 24, 0.6)' } : undefined}
      >
        <div className="text-2xl font-semibold text-text">{profile.name}</div>
        <div className={isRunning ? 'text-sm text-green' : 'text-sm text-subtext'}>
          {isRunning ? t('status_tracking') : STATUS_LABEL[profile.status]}
        </div>
        {profile.rating > 0 && (
          <div className="text-base text-gold">
            {'★'.repeat(profile.rating)}
            {'☆'.repeat(5 - profile.rating)}
          </div>
        )}
        <div className="font-mono text-5xl font-bold tabular-nums text-text">{formatSeconds(seconds)}</div>
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => void togglePlay()}
            className={`rounded-lg px-6 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 ${
              isRunning ? 'bg-red' : 'bg-green'
            }`}
          >
            {isRunning ? t('btn_pause') : t('btn_play')}
          </button>
          <button
            onClick={() => void toggleComplete()}
            className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${
              profile.status === 'completed' ? 'bg-accent text-bg' : 'bg-gold text-bg'
            }`}
          >
            {t('btn_complete')}
          </button>
        </div>
      </div>
    </div>
  )
}
