import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../../state/uiStore'
import type { GameSource } from '@shared/types'

/**
 * Settings → Launchers. Where the games come from, and how to correct it.
 *
 * Every launcher here is detected automatically — Steam through its own
 * registry key and library folders, Epic through its manifests, GOG through
 * its per-game keys, Xbox by looking for an XboxGames folder on every drive.
 * The override exists for the case detection cannot cover: games kept
 * somewhere the launcher does not advertise.
 *
 * A folder set here is scanned IN ADDITION to the automatic detection, never
 * instead of it, so pointing at one location can't hide games in another.
 */

/** Nexon is last because it is the one whose detection is partly name-only. */
const LAUNCHERS: { source: GameSource; labelKey: string }[] = [
  { source: 'steam', labelKey: 'source_steam' },
  { source: 'epic', labelKey: 'source_epic' },
  { source: 'gog', labelKey: 'source_gog' },
  { source: 'xbox', labelKey: 'source_xbox' },
  { source: 'battlenet', labelKey: 'source_battlenet' },
  { source: 'ea', labelKey: 'source_ea' },
  { source: 'nexon', labelKey: 'source_nexon' }
]

export function LauncherSettings(): React.JSX.Element {
  const { t } = useTranslation()
  const [launcherFolders, setLauncherFolders] = useState<Partial<Record<GameSource, string>>>({})
  const [extraFolders, setExtraFolders] = useState<string[]>([])
  const openDialog = useUiStore((s) => s.openDialog)

  const load = useCallback(async () => {
    const [launchers, extras] = await Promise.all([
      window.api.detect.listLauncherFolders(),
      window.api.detect.listGameFolders()
    ])
    setLauncherFolders(launchers)
    setExtraFolders(extras)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setFolder(source: GameSource, clear = false): Promise<void> {
    setLauncherFolders(await window.api.detect.setLauncherFolder(source, clear))
  }

  async function addExtra(): Promise<void> {
    await window.api.detect.addGameFolder()
    await load()
  }

  async function removeExtra(folder: string): Promise<void> {
    await window.api.detect.removeGameFolder(folder)
    await load()
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
       * The action first: this whole tab exists to serve the scan, so the scan
       * shouldn't be buried under the configuration for it.
       */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => openDialog('installed')}
          className="self-start rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
        >
          {t('installed_scan_button')}
        </button>
        <span className="text-xs text-subtext">{t('installed_scan_hint')}</span>
      </div>

      <div className="flex flex-col gap-2 border-t border-card/60 pt-4">
        <div className="text-xs text-subtext">{t('launcher_paths_hint')}</div>
        {LAUNCHERS.map(({ source, labelKey }) => {
          const folder = launcherFolders[source]
          return (
            <div key={source} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-sm text-text">{t(labelKey)}</span>
              <span
                className={`min-w-0 flex-1 truncate text-xs ${folder ? 'text-text' : 'text-subtext italic'}`}
                title={folder ?? undefined}
              >
                {folder ?? t('launcher_path_auto')}
              </span>
              <button
                onClick={() => void setFolder(source)}
                className="shrink-0 rounded bg-card px-2.5 py-1 text-xs text-text hover:bg-card/70"
              >
                {t('btn_change')}
              </button>
              {folder && (
                <button
                  onClick={() => void setFolder(source, true)}
                  className="shrink-0 text-xs text-red hover:underline"
                >
                  {t('label_remove')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/*
       * The catch-all, for games that belong to no launcher at all — a DRM-free
       * copy, an old install, anything with its own folder.
       */}
      <div className="flex flex-col gap-2 border-t border-card/60 pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-subtext">{t('installed_scan_folders_hint')}</span>
          <button
            onClick={() => void addExtra()}
            className="shrink-0 rounded bg-card px-3 py-1 text-xs text-text hover:bg-card/70"
          >
            {t('installed_scan_add_folder')}
          </button>
        </div>
        {extraFolders.map((folder) => (
          <div key={folder} className="flex items-center gap-2 text-xs text-subtext">
            <span className="min-w-0 flex-1 truncate" title={folder}>
              {folder}
            </span>
            <button
              onClick={() => void removeExtra(folder)}
              className="shrink-0 text-red hover:underline"
            >
              {t('label_remove')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
