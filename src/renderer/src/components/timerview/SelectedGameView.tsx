import type { CSSProperties } from 'react'
import { useProfilesStore } from '../../state/profilesStore'
import { useTimerStore } from '../../state/timerStore'
import { useUiStore } from '../../state/uiStore'
import { formatSeconds } from '@shared/format'
import type { Status } from '@shared/types'

const STATUS_LABEL: Record<Status, string> = {
  in_progress: 'Paused',
  completed: 'Completed',
  dropped: 'Dropped',
  on_hold: 'On Hold'
}

export function SelectedGameView(): React.JSX.Element {
  const selected = useUiStore((s) => s.selected)
  const profile = useProfilesStore((s) => (selected ? s.profiles[selected] : null))
  const running = useTimerStore((s) => s.running)

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-subtext">No profile selected</div>
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
        backgroundImage: `url(gt-asset://backgrounds/${encodeURIComponent(profile.bgImage)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }
    : profile.bgColor
      ? { backgroundColor: profile.bgColor }
      : {}

  const hasCustomBackground = !!(profile.bgImage || profile.bgColor)

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden"
      style={backgroundStyle}
    >
      {hasCustomBackground && <div className="absolute inset-0 bg-black/35" />}
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="text-2xl font-semibold text-text">{profile.name}</div>
        <div className={isRunning ? 'text-sm text-green' : 'text-sm text-subtext'}>
          {isRunning ? 'Tracking time…' : STATUS_LABEL[profile.status]}
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
            {isRunning ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={() => void toggleComplete()}
            className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${
              profile.status === 'completed' ? 'bg-accent text-bg' : 'bg-gold text-bg'
            }`}
          >
            {profile.status === 'completed' ? '✓ Completed' : '✓ Complete'}
          </button>
        </div>
      </div>
    </div>
  )
}
