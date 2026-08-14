import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { Spinner } from '../common/Spinner'
import { toast } from '../common/Toast'
import { useProfilesStore } from '../../state/profilesStore'
import type { GameSource, InstalledGame } from '@shared/types'

/**
 * Offers the games already installed on this PC, from every launcher Gamut can
 * read, plus any folder the user points at.
 *
 * Shown once on first run, and available for ever after from Settings → Games.
 * Having the permanent entry point is what makes the one-time prompt safe to
 * decline: saying "not now" costs nothing because the door stays open.
 *
 * Games already in the library are listed rather than filtered out, greyed and
 * pre-unticked. "17 found, 12 already added" tells you the scan worked; a
 * silently shorter list looks like it missed things.
 */

const SOURCE_LABEL: Record<GameSource, string> = {
  steam: 'source_steam',
  epic: 'source_epic',
  gog: 'source_gog',
  xbox: 'source_xbox',
  battlenet: 'source_battlenet',
  ea: 'source_ea',
  nexon: 'source_nexon',
  folder: 'source_folder'
}

const SOURCE_ORDER: GameSource[] = ['steam', 'epic', 'gog', 'xbox', 'battlenet', 'ea', 'folder', 'nexon']

export function InstalledGamesDialog({
  onClose,
  firstRun = false
}: {
  onClose: () => void
  firstRun?: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const [games, setGames] = useState<InstalledGame[] | null>(null)
  const [folders, setFolders] = useState<string[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setGames(null)
    const [found, dirs] = await Promise.all([
      window.api.detect.listInstalled(),
      window.api.detect.listGameFolders()
    ])
    setFolders(dirs)
    setGames(found)
    // Everything not already in the library and confidently installed starts
    // ticked: the common case is "yes, add them", and unticking a few is less
    // work than ticking all. Name-only finds stay unticked — see `confident`.
    setChosen(new Set(found.filter((g) => !g.alreadyAdded && g.confident).map((g) => g.id)))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const addable = games?.filter((g) => !g.alreadyAdded) ?? []
  const alreadyCount = (games?.length ?? 0) - addable.length

  function toggle(id: string): void {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function skip(): Promise<void> {
    if (firstRun) await window.api.detect.skipInstalledScan()
    onClose()
  }

  async function addFolder(): Promise<void> {
    const folder = await window.api.detect.addGameFolder()
    if (folder) await load()
  }

  async function removeFolder(folder: string): Promise<void> {
    await window.api.detect.removeGameFolder(folder)
    await load()
  }

  async function doImport(): Promise<void> {
    setBusy(true)
    try {
      const result = await window.api.detect.importInstalled([...chosen])
      useProfilesStore.getState().setAll(await window.api.profiles.list())
      toast.info(t('info_installed_imported', { count: result.importedCount }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
    onClose()
  }

  const grouped = SOURCE_ORDER.map((source) => ({
    source,
    items: (games ?? []).filter((g) => g.source === source)
  })).filter((g) => g.items.length > 0)

  return (
    <Modal
      title={t('installed_scan_title')}
      onClose={() => void skip()}
      width="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={() => void skip()}
            className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
          >
            {firstRun ? t('installed_scan_not_now') : t('btn_close')}
          </button>
          <button
            onClick={() => void doImport()}
            disabled={busy || chosen.size === 0}
            className="flex items-center gap-2 rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-40"
          >
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {t('installed_scan_add', { count: chosen.size })}
          </button>
        </div>
      }
    >
      {games === null ? (
        <div className="flex items-center gap-2 py-2 text-sm text-subtext">
          <Spinner className="h-4 w-4" />
          {t('installed_scan_searching')}
        </div>
      ) : games.length === 0 ? (
        <p className="text-sm text-subtext">{t('installed_scan_none')}</p>
      ) : (
        <>
          <p className="text-sm text-text">
            {t('installed_scan_found', { count: addable.length })}
            {alreadyCount > 0 && (
              <span className="text-subtext"> {t('installed_scan_already', { count: alreadyCount })}</span>
            )}
          </p>
          {/*
           * Stated up front, not discovered afterwards. Gamut measures play
           * time you actually tracked; it cannot know what you played before
           * these games were imported, and importing a launcher's own number
           * would put the very figure this app exists to correct into the field
           * it promises is honest.
           */}
          <p className="mt-1 text-xs text-subtext">{t('installed_scan_zero_note')}</p>

          <div className="mt-3 max-h-64 overflow-y-auto rounded bg-card/40 p-1">
            {grouped.map(({ source, items }) => (
              <div key={source} className="mb-1">
                <div className="px-2 pt-1.5 pb-1 text-[0.65rem] font-medium tracking-wide text-subtext uppercase">
                  {t(SOURCE_LABEL[source])}
                </div>
                {items.map((game) => (
                  <label
                    key={game.id}
                    className={`flex items-center gap-2.5 rounded px-2 py-1.5 text-sm ${
                      game.alreadyAdded ? 'text-subtext' : 'cursor-pointer text-text hover:bg-card/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={game.alreadyAdded}
                      checked={chosen.has(game.id)}
                      onChange={() => toggle(game.id)}
                    />
                    <span className="min-w-0 flex-1 truncate" title={game.exePath ?? undefined}>
                      {game.name}
                    </span>
                    {game.alreadyAdded ? (
                      <span className="shrink-0 text-xs">{t('installed_scan_in_library')}</span>
                    ) : (
                      /*
                       * A game found by name alone can't be launched and might
                       * not even be installed any more, so it says so rather
                       * than looking identical to a real install.
                       */
                      !game.confident && (
                        <span className="shrink-0 text-xs text-subtext">
                          {t('installed_scan_name_only')}
                        </span>
                      )
                    )}
                  </label>
                ))}
              </div>
            ))}
          </div>

          {addable.length > 0 && (
            <div className="mt-2 flex gap-3 text-xs">
              <button
                onClick={() => setChosen(new Set(addable.map((g) => g.id)))}
                className="text-accent hover:underline"
              >
                {t('installed_scan_select_all')}
              </button>
              <button onClick={() => setChosen(new Set())} className="text-accent hover:underline">
                {t('installed_scan_select_none')}
              </button>
            </div>
          )}
        </>
      )}

      {/*
       * The answer to "my games are somewhere else". Every launcher here lays
       * its games out as one folder per game, so pointing at that parent folder
       * works for a launcher on another drive, a DRM-free copy, or anything
       * with no launcher at all.
       */}
      <div className="mt-4 border-t border-card/60 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-subtext">{t('installed_scan_folders_hint')}</span>
          <button
            onClick={() => void addFolder()}
            className="shrink-0 rounded bg-card px-3 py-1 text-xs text-text hover:bg-card/70"
          >
            {t('installed_scan_add_folder')}
          </button>
        </div>
        {folders.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {folders.map((folder) => (
              <div key={folder} className="flex items-center gap-2 text-xs text-subtext">
                <span className="min-w-0 flex-1 truncate" title={folder}>
                  {folder}
                </span>
                <button
                  onClick={() => void removeFolder(folder)}
                  className="shrink-0 text-red hover:underline"
                >
                  {t('label_remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </Modal>
  )
}
