import { useEffect, useState } from 'react'
import { Modal } from '../common/Modal'
import { formatSeconds } from '@shared/format'
import { toast } from '../common/Toast'
import { useProfilesStore } from '../../state/profilesStore'
import { useSettingsStore, applyThemeToDocument } from '../../state/settingsStore'

interface Detected {
  path: string
  profileCount: number
  totalSeconds: number
}

export function LegacyImportPrompt(): React.JSX.Element | null {
  const [detected, setDetected] = useState<Detected | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    void (async () => {
      const result = await window.api.legacyImport.detect(false)
      if (result.found && result.path) {
        setDetected({
          path: result.path,
          profileCount: result.profileCount ?? 0,
          totalSeconds: result.totalSeconds ?? 0
        })
      }
    })()
  }, [])

  if (!detected || dismissed) return null

  async function doImport(path: string): Promise<void> {
    try {
      const result = await window.api.legacyImport.run(path)
      useProfilesStore.getState().setAll(await window.api.profiles.list())
      const settings = await window.api.settings.get()
      useSettingsStore.getState().setSettings(settings)
      applyThemeToDocument(settings)
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
        {detected.profileCount === 1 ? '' : 's'}, <b>{formatSeconds(detected.totalSeconds)}</b> tracked.
      </p>
      <p className="mt-1 break-all text-xs text-subtext">{detected.path}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => void chooseDifferentFile()}
          className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
        >
          Choose a different file…
        </button>
        <button onClick={() => void skip()} className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70">
          Skip
        </button>
        <button
          onClick={() => void doImport(detected.path)}
          className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
        >
          Import
        </button>
      </div>
    </Modal>
  )
}
