import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { useSettingsStore, updateSettings } from '../../state/settingsStore'
import { useTimerStore } from '../../state/timerStore'
import { useUiStore, selectProfile } from '../../state/uiStore'
import { sortAndFilterProfiles } from '../../state/selectors'
import { formatSeconds } from '@shared/format'
import { GENRE_OPTIONS } from '@shared/constants'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { toast } from '../common/Toast'
import type { Profile, SortMode, Status } from '@shared/types'

const SIDEBAR_MIN_WIDTH = 240 // the size the panel used to be fixed at
const SIDEBAR_MAX_WIDTH = 420

/**
 * Each row subscribes to its own running-seconds slice instead of GameList
 * subscribing to the whole `running` record — main pushes a tick every
 * 500ms, and without this every row would re-render twice a second
 * regardless of whether that particular game is even running. Zustand only
 * re-renders a component when its own selector's return value actually
 * changes, so this alone means non-running rows never re-render on a tick.
 * Wrapped in memo() too, as a second layer, so a row also skips re-rendering
 * when GameList re-renders for an unrelated reason (sorting/filtering,
 * another profile's rating changing, etc.) — profilesStore's upsert() keeps
 * other profiles' object references stable, so memo's default shallow
 * prop comparison actually has something to compare against.
 */
const GameRow = memo(function GameRow({
  profile,
  isSelected,
  iconSize,
  onSelect,
  onOpenContextMenu
}: {
  profile: Profile
  isSelected: boolean
  iconSize: number
  onSelect: (name: string) => void
  onOpenContextMenu: (e: React.MouseEvent, name: string) => void
}): React.JSX.Element {
  const liveSeconds = useTimerStore((s) => s.running[profile.name])
  const isRunning = liveSeconds !== undefined
  const seconds = liveSeconds ?? profile.seconds

  return (
    <button
      onClick={() => onSelect(profile.name)}
      onContextMenu={(e) => {
        e.preventDefault()
        onSelect(profile.name)
        onOpenContextMenu(e, profile.name)
      }}
      className={`mb-1 flex w-full items-start gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors ${
        isSelected ? 'bg-card' : 'hover:bg-card/60'
      }`}
    >
      {profile.iconFile ? (
        <img
          src={`gt-asset://icons/${encodeURIComponent(profile.iconFile)}`}
          style={{ width: iconSize, height: iconSize }}
          className="shrink-0 rounded object-cover"
        />
      ) : (
        <span className="shrink-0 rounded bg-card" style={{ width: iconSize, height: iconSize }} />
      )}
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isRunning ? 'bg-green' : 'bg-transparent'}`} />
      <span className={`min-w-0 flex-1 break-normal ${isRunning ? 'text-green' : 'text-text'}`}>
        {profile.name}
      </span>
      <span className="shrink-0 text-[11px] text-subtext">{formatSeconds(seconds)}</span>
    </button>
  )
})

export function GameList(): React.JSX.Element {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const settings = useSettingsStore((s) => s.settings)
  const selected = useUiStore((s) => s.selected)
  const contextMenu = useUiStore((s) => s.contextMenu)
  const openContextMenu = useUiStore((s) => s.openContextMenu)
  const closeContextMenu = useUiStore((s) => s.closeContextMenu)
  const openDialog = useUiStore((s) => s.openDialog)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [width, setWidth] = useState(SIDEBAR_MIN_WIDTH)
  const resizing = useRef(false)

  // Stable references so GameRow's memo() actually skips re-rendering
  // unrelated rows — an inline arrow function passed as a prop would be a
  // new reference on every GameList render, which defeats memo regardless
  // of whether the row's other props actually changed.
  const handleSelectRow = useCallback((name: string) => void selectProfile(name), [])
  const handleOpenContextMenu = useCallback(
    (e: React.MouseEvent, name: string) => openContextMenu(e.clientX, e.clientY, name),
    [openContextMenu]
  )

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizing.current = true
    const onMove = (moveEvent: MouseEvent): void => {
      if (!resizing.current) return
      const next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, moveEvent.clientX))
      setWidth(next)
    }
    const onUp = (): void => {
      resizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const STATUS_OPTIONS: { value: 'All' | Status; label: string }[] = [
    { value: 'All', label: t('filter_all') },
    { value: 'in_progress', label: t('status_in_progress') },
    { value: 'completed', label: t('status_completed') },
    { value: 'dropped', label: t('status_dropped') },
    { value: 'on_hold', label: t('status_on_hold') }
  ]

  const sorted = useMemo(
    () =>
      settings
        ? sortAndFilterProfiles(profiles, settings.sortMode, settings.genreFilter, settings.statusFilter)
        : [],
    [profiles, settings]
  )

  async function handleAdd(): Promise<void> {
    const name = newName.trim()
    setAdding(false)
    setNewName('')
    if (!name) return
    try {
      const profile = await window.api.profiles.create(name)
      useProfilesStore.getState().upsert(profile)
      await selectProfile(profile.name)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDuplicate(name: string): Promise<void> {
    const copy = await window.api.profiles.duplicate(name)
    useProfilesStore.getState().upsert(copy)
  }

  async function handleResetTime(name: string): Promise<void> {
    if (!window.confirm(t('confirm_reset_time_msg', { name }))) return
    useProfilesStore.getState().upsert(await window.api.profiles.resetTime(name))
  }

  async function handleDelete(name: string): Promise<void> {
    if (!window.confirm(t('confirm_delete_msg', { name }))) return
    await window.api.profiles.delete(name)
    useProfilesStore.getState().remove(name)
    if (selected === name) await selectProfile(null)
  }

  // Delete key deletes the selected game (still confirms) — matches v1's
  // <Delete> binding on the games list. Skipped while typing anywhere
  // (rename field, notes, add-game input, etc.) so it never eats a
  // legitimate keystroke.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Delete') return
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      const isEditable = tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable
      if (isEditable || !selected) return
      void handleDelete(selected)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected])

  async function handleExport(name: string): Promise<void> {
    const result = await window.api.importExport.exportProfile(name)
    if (result) toast.info(t('info_exported_msg', { path: result.path }))
  }

  async function handleImport(): Promise<void> {
    const profile = await window.api.importExport.importProfile()
    if (profile) {
      useProfilesStore.getState().upsert(profile)
      await selectProfile(profile.name)
      toast.info(t('info_imported_msg', { name: profile.name }))
    }
  }

  function menuItemsFor(name: string): ContextMenuItem[] {
    return [
      { label: t('ctx_modify'), onClick: () => openDialog('modify', name) },
      { label: t('ctx_duplicate'), onClick: () => void handleDuplicate(name) },
      { label: t('ctx_reset_time'), onClick: () => void handleResetTime(name) },
      { label: t('ctx_notes'), onClick: () => openDialog('notes', name) },
      { label: t('ctx_export'), onClick: () => void handleExport(name), separatorBefore: true },
      { label: t('ctx_import'), onClick: () => void handleImport() },
      { label: t('ctx_delete'), onClick: () => void handleDelete(name), danger: true, separatorBefore: true }
    ]
  }

  return (
    <div className="relative flex h-full shrink-0 flex-col bg-panel" style={{ width }}>
      <div className="px-4 pt-4 pb-1 text-xs font-medium tracking-wide text-subtext">{t('label_games')}</div>

      <div className="flex flex-col gap-1.5 px-2.5 pb-2">
        <select
          className="w-full rounded bg-card px-2 py-1 text-xs text-text outline-none"
          value={settings?.sortMode ?? 'name'}
          onChange={(e) => void updateSettings({ sortMode: e.target.value as SortMode })}
        >
          <option value="name">{t('sort_name_az')}</option>
          <option value="last_played">{t('sort_last_played')}</option>
          <option value="rating">{t('sort_rating_desc')}</option>
          <option value="genre">{t('sort_genre_az')}</option>
        </select>
        <select
          className="w-full rounded bg-card px-2 py-1 text-xs text-text outline-none"
          value={settings?.statusFilter ?? 'All'}
          onChange={(e) => void updateSettings({ statusFilter: e.target.value as 'All' | Status })}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded bg-card px-2 py-1 text-xs text-text outline-none"
          value={settings?.genreFilter ?? 'All'}
          onChange={(e) => void updateSettings({ genreFilter: e.target.value })}
        >
          <option value="All">{t('filter_all')}</option>
          {GENRE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {t(g, { ns: 'genres' })}
            </option>
          ))}
        </select>
      </div>

      <div
        onMouseDown={startResize}
        className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-accent/50"
      />

      <div
        className="flex-1 overflow-y-auto px-1.5"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault()
            openContextMenu(e.clientX, e.clientY, null)
          }
        }}
      >
        {sorted.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-subtext">{t('empty_no_games')}</div>
        )}
        {sorted.map((p) => (
          <GameRow
            key={p.name}
            profile={p}
            isSelected={selected === p.name}
            iconSize={settings?.iconSize ?? 36}
            onSelect={handleSelectRow}
            onOpenContextMenu={handleOpenContextMenu}
          />
        ))}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={
            contextMenu.target
              ? menuItemsFor(contextMenu.target)
              : [
                  { label: t('menu_add_game'), onClick: () => setAdding(true) },
                  { label: t('ctx_import'), onClick: () => void handleImport() }
                ]
          }
        />
      )}

      <div className="p-2.5">
        {adding ? (
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => void handleAdd()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAdd()
                if (e.key === 'Escape') {
                  setAdding(false)
                  setNewName('')
                }
              }}
              placeholder={t('dlg_add_game_prompt')}
              className="w-full flex-1 rounded bg-card px-2.5 py-2 text-sm text-text outline-none ring-1 ring-accent"
            />
            <button
              // Prevents the input's onBlur from firing (and submitting) before
              // this button's onClick runs, so the click is a single clean
              // submit instead of racing a blur-triggered one.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void handleAdd()}
              aria-label="Confirm"
              className="flex shrink-0 items-center justify-center rounded bg-accent px-3 text-bg hover:opacity-90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded bg-accent py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
          >
            {t('btn_add_game')}
          </button>
        )}
      </div>
    </div>
  )
}
