import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { useUiStore, launchGame } from '../../state/uiStore'
import { useSettingsStore } from '../../state/settingsStore'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { toast } from '../common/Toast'
import { LibraryBrowse } from './LibraryBrowse'
import { LibraryDetail } from './LibraryDetail'

/**
 * The Library tab: either the collection (grid or list) or one game's detail
 * page. Two states of one tab rather than two tabs, because opening a game and
 * going back are navigation *within* your library, not a change of subject.
 *
 * This tab owns every management action in the app — add, edit, rate, tag,
 * favourite, art, link, import, export, delete — there is nowhere else to do
 * any of it, which is what let the separate Timer tab go away entirely.
 */
export function LibraryTab(): React.JSX.Element {
  const { t } = useTranslation()
  const libraryFocus = useUiStore((s) => s.libraryFocus)
  const contextMenu = useUiStore((s) => s.contextMenu)
  const closeContextMenu = useUiStore((s) => s.closeContextMenu)
  const openDialog = useUiStore((s) => s.openDialog)
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)
  const globalSubCategoriesEnabled = useSettingsStore((s) => s.settings?.subCategoriesEnabled ?? true)

  async function handleDelete(name: string): Promise<void> {
    if (!window.confirm(t('confirm_delete_msg', { name }))) return
    await window.api.profiles.delete(name)
    useProfilesStore.getState().remove(name)
    if (useUiStore.getState().libraryFocus === name) setLibraryFocus(null)
  }

  async function handleExport(name: string): Promise<void> {
    const result = await window.api.importExport.exportProfile(name)
    if (result) toast.info(t('info_exported_msg', { path: result.path }))
  }

  async function handleImport(): Promise<void> {
    const profile = await window.api.importExport.importProfile()
    if (profile) {
      useProfilesStore.getState().upsert(profile)
      toast.info(t('info_imported_msg', { name: profile.name }))
    }
  }

  async function handleToggleFavorite(name: string): Promise<void> {
    const current = useProfilesStore.getState().profiles[name]
    if (!current) return
    useProfilesStore.getState().upsert(await window.api.profiles.setFavorite(name, !current.favorite))
  }

  function menuItemsFor(name: string): ContextMenuItem[] {
    const profile = useProfilesStore.getState().profiles[name]
    const canLaunch =
      !!profile && (profile.steamAppId != null || !!profile.launchUri || !!profile.exePath)
    return [
      ...(canLaunch
        ? [{ label: t('btn_launch_game'), onClick: () => void launchGame(name) }]
        : []),
      { label: t('ctx_modify'), onClick: () => openDialog('modify', name), separatorBefore: canLaunch },
      { label: t('ctx_info'), onClick: () => openDialog('info', name) },
      { label: t('ctx_notes'), onClick: () => openDialog('notes', name) },
      // Creation moved to a toggle on the game's own page next to Complete —
      // there was no way to start using the feature from that page before,
      // and having creation live ONLY in a right-click menu elsewhere was
      // the actual complaint, not something worth keeping alongside it.
      ...(profile &&
      (profile.subCategoriesEnabled ?? globalSubCategoriesEnabled) &&
      profile.subCategories.length > 0
        ? [{ label: t('ctx_show_profile_stats'), onClick: () => openDialog('profileStatsPerGame', name) }]
        : []),
      {
        label: t(profile?.favorite ? 'ctx_favorite_remove' : 'ctx_favorite_add'),
        onClick: () => void handleToggleFavorite(name)
      },
      { label: t('ctx_export'), onClick: () => void handleExport(name) },
      { label: t('ctx_import'), onClick: () => void handleImport() },
      { label: t('ctx_delete'), onClick: () => void handleDelete(name), danger: true, separatorBefore: true }
    ]
  }

  // min-h-0 is load-bearing: a flex item defaults to min-height:auto and so
  // refuses to shrink below its content. Without it this grew past the window
  // and overflow-hidden clipped the bottom of the detail page — the Delete
  // button became unreachable, with no scrollbar to get to it.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {libraryFocus ? <LibraryDetail name={libraryFocus} /> : <LibraryBrowse />}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={
            contextMenu.target
              ? menuItemsFor(contextMenu.target)
              : [
                  { label: t('menu_add_game'), onClick: () => openDialog('add') },
                  { label: t('ctx_import'), onClick: () => void handleImport() }
                ]
          }
        />
      )}
    </div>
  )
}
