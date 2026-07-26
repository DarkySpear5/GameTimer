import { useEffect, useState } from 'react'
import { Modal } from '../common/Modal'
import type { UpdateInfo } from '@shared/types'

type Phase = 'available' | 'downloading' | 'downloaded'

/**
 * Subscribes to the main process's update events for the lifetime of the
 * app (mounted once from App.tsx) and only renders a modal once there's
 * actually something to say — silent otherwise, matching the app's
 * "never nag on a failed/empty check" policy.
 */
export function UpdatePrompt(): React.JSX.Element | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [phase, setPhase] = useState<Phase>('available')
  const [percent, setPercent] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const offAvailable = window.api.updater.onUpdateAvailable((update) => {
      setInfo(update)
      setPhase('available')
      setDismissed(false)
    })
    const offProgress = window.api.updater.onDownloadProgress(({ percent }) => setPercent(percent))
    const offDownloaded = window.api.updater.onUpdateDownloaded(() => setPhase('downloaded'))
    return () => {
      offAvailable()
      offProgress()
      offDownloaded()
    }
  }, [])

  if (!info || dismissed) return null

  async function startDownload(): Promise<void> {
    setPhase('downloading')
    await window.api.updater.downloadUpdate()
  }

  return (
    <Modal title="Update available" onClose={() => setDismissed(true)} width="max-w-sm">
      {phase === 'available' && (
        <>
          <p className="text-sm text-text">
            Gamut <b>v{info.version}</b> is available. Download and install it now?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
            >
              Not now
            </button>
            <button
              onClick={() => void startDownload()}
              className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
            >
              Update
            </button>
          </div>
        </>
      )}

      {phase === 'downloading' && (
        <>
          <p className="mb-2 text-sm text-text">Downloading update…</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-card">
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(percent)}%` }} />
          </div>
          <p className="mt-1 text-right text-xs text-subtext">{Math.round(percent)}%</p>
        </>
      )}

      {phase === 'downloaded' && (
        <>
          <p className="text-sm text-text">Update downloaded. Restart Gamut now to install it?</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
            >
              Later
            </button>
            <button
              onClick={() => window.api.updater.quitAndInstall()}
              className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
            >
              Restart now
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
