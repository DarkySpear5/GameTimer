import { useEffect, useState } from 'react'
import { Modal } from '../common/Modal'
import { Spinner } from '../common/Spinner'
import { formatSeconds } from '@shared/format'
import { toast } from '../common/Toast'
import { useProfilesStore } from '../../state/profilesStore'
import { loadSettings } from '../../state/settingsStore'
import { useTimeFormat } from '../../state/useTimeFormat'

interface Detected {
  path: string
  profileCount: number
  totalSeconds: number
}

/**
 * `onResolved` fires once this prompt can no longer appear — whether the user
 * imported, skipped, or there was nothing to find. First-run offers are
 * sequenced rather than stacked, and this is how the next one knows its turn
 * has come. The v1 import goes first because it is about data the user already
 * has, which matters more than anything Gamut can offer to add.
 */
export function LegacyImportPrompt({ onResolved }: { onResolved?: () => void }): React.JSX.Element | null {
  const timeFormat = useTimeFormat()
  const [detected, setDetected] = useState<Detected | null>(null)
  const [dismissed, setDismissed] = useState(false)
  // J4: the import copies every icon/background it finds, which is real disk
  // I/O — the button used to stay clickable with no sign anything was running.
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const result = await window.api.legacyImport.detect(false)
      if (result.found && result.path) {
        setDetected({
          path: result.path,
          profileCount: result.profileCount ?? 0,
          totalSeconds: result.totalSeconds ?? 0
        })
      } else {
        onResolved?.()
      }
    })()
  }, [])

  useEffect(() => {
    if (dismissed) onResolved?.()
  }, [dismissed])

  if (!detected || dismissed) return null

  async function doImport(path: string): Promise<void> {
    setBusy(true)
    try {
      const result = await window.api.legacyImport.run(path)
      useProfilesStore.getState().setAll(await window.api.profiles.list())
      await loadSettings()
      toast.info(`Imported ${result.importedCount} game${result.importedCount === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    setDismissed(true)
  }

  async function skip(): Promise<void> {
    await window.api.legacyImport.skip()
    setDismissed(true)
  }

  async function chooseDifferentFile(): Promise<void> {
    const path = await window.api.legacyImport.browseForFile()
    if (path) await doImport(path)
  }

  return (
    <Modal title="Import your v1 library?" onClose={() => void skip()} width="max-w-md">
      <p className="text-sm text-text">
        We found an existing Game Timer library — <b>{detected.profileCount}</b> game
        {detected.profileCount === 1 ? '' : 's'}, <b>{formatSeconds(detected.totalSeconds, timeFormat)}</b> tracked.
      </p>
      <p className="mt-1 break-all text-xs text-subtext">{detected.path}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => void chooseDifferentFile()}
          disabled={busy}
          className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70 disabled:opacity-50"
        >
          Choose a different file…
        </button>
        <button
          onClick={() => void skip()}
          disabled={busy}
          className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70 disabled:opacity-50"
        >
          Skip
        </button>
        <button
          onClick={() => void doImport(detected.path)}
          disabled={busy}
          className="flex items-center gap-2 rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Spinner className="h-3.5 w-3.5" />}
          Import
        </button>
      </div>
    </Modal>
  )
}
