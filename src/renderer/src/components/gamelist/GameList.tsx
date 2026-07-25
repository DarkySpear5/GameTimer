import { useMemo, useState } from 'react'
import { useProfilesStore } from '../../state/profilesStore'
import { useSettingsStore, updateSettings } from '../../state/settingsStore'
import { useTimerStore } from '../../state/timerStore'
import { useUiStore, selectProfile } from '../../state/uiStore'
import { sortAndFilterProfiles } from '../../state/selectors'
import { formatSeconds } from '@shared/format'
import { GENRE_OPTIONS } from '@shared/constants'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { toast } from '../common/Toast'
import type { SortMode, Status } from '@shared/types'

const STATUS_OPTIONS: { value: 'All' | Status; label: string }[] = [
  { value: 'All', label: 'All statuses' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'on_hold', label: 'On Hold' }
]

export function GameList(): React.JSX.Element {
  const profiles = useProfilesStore((s) => s.profiles)
  const settings = useSettingsStore((s) => s.settings)
  const running = useTimerStore((s) => s.running)
  const selected = useUiStore((s) => s.selected)
  const contextMenu = useUiStore((s) => s.contextMenu)
  const openContextMenu = useUiStore((s) => s.openContextMenu)
  const closeContextMenu = useUiStore((s) => s.closeContextMenu)
  const openDialog = useUiStore((s) => s.openDialog)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

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
    if (!window.confirm(`Reset "${name}"'s tracked time to zero? This cannot be undone.`)) return
    useProfilesStore.getState().upsert(await window.api.profiles.resetTime(name))
  }

  async function handleDelete(name: string): Promise<void> {
    if (!window.confirm(`Delete "${name}" and its tracked time? This cannot be undone.`)) return
    await window.api.profiles.delete(name)
    useProfilesStore.getState().remove(name)
    if (selected === name) await selectProfile(null)
  }

  async function handleExport(name: string): Promise<void> {
    const result = await window.api.importExport.exportProfile(name)
    if (result) toast.info(`Exported to ${result.path}`)
  }

  async function handleImport(): Promise<void> {
    const profile = await window.api.importExport.importProfile()
    if (profile) {
      useProfilesStore.getState().upsert(profile)
      await selectProfile(profile.name)
    }
  }

  function menuItemsFor(name: string): ContextMenuItem[] {
    return [
      { label: 'Modify', onClick: () => openDialog('modify', name) },
      { label: 'Duplicate', onClick: () => void handleDuplicate(name) },
      { label: 'Reset Time', onClick: () => void handleResetTime(name) },
      { label: 'Notes', onClick: () => openDialog('notes', name) },
      { label: 'Export…', onClick: () => void handleExport(name), separatorBefore: true },
      { label: 'Import…', onClick: () => void handleImport() },
      { label: 'Delete', onClick: () => void handleDelete(name), danger: true, separatorBefore: true }
    ]
  }

  return (
    <div className="flex h-full w-60 shrink-0 flex-col bg-panel">
      <div className="px-4 pt-4 pb-1 text-xs font-medium tracking-wide text-subtext">GAMES</div>

      <div className="flex gap-1.5 px-2.5 pb-1.5">
        <select
          className="flex-1 rounded bg-card px-2 py-1 text-xs text-text outline-none"
          value={settings?.sortMode ?? 'name'}
          onChange={(e) => void updateSettings({ sortMode: e.target.value as SortMode })}
        >
          <option value="name">Name (A-Z)</option>
          <option value="last_played">Last Played</option>
          <option value="rating">Rating</option>
          <option value="genre">Genre</option>
        </select>
        <select
          className="flex-1 rounded bg-card px-2 py-1 text-xs text-text outline-none"
          value={settings?.statusFilter ?? 'All'}
          onChange={(e) => void updateSettings({ statusFilter: e.target.value as 'All' | Status })}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="px-2.5 pb-2">
        <select
          className="w-full rounded bg-card px-2 py-1 text-xs text-text outline-none"
          value={settings?.genreFilter ?? 'All'}
          onChange={(e) => void updateSettings({ genreFilter: e.target.value })}
        >
          <option value="All">All genres</option>
          {GENRE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

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
          <div className="px-3 py-6 text-center text-xs text-subtext">No games yet — click + Add Game</div>
        )}
        {sorted.map((p) => {
          const isRunning = p.name in running
          const seconds = running[p.name] ?? p.seconds
          return (
            <button
              key={p.name}
              onClick={() => void selectProfile(p.name)}
              onContextMenu={(e) => {
                e.preventDefault()
                void selectProfile(p.name)
                openContextMenu(e.clientX, e.clientY, p.name)
              }}
              className={`mb-1 flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors ${
                selected === p.name ? 'bg-card' : 'hover:bg-card/60'
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${isRunning ? 'bg-green' : 'bg-transparent'}`} />
              <span className={`flex-1 truncate ${isRunning ? 'text-green' : 'text-text'}`}>{p.name}</span>
              <span className="shrink-0 text-[11px] text-subtext">{formatSeconds(seconds)}</span>
            </button>
          )
        })}
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
                  { label: '+ Add Game', onClick: () => setAdding(true) },
                  { label: 'Import…', onClick: () => void handleImport() }
                ]
          }
        />
      )}

      <div className="p-2.5">
        {adding ? (
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
            placeholder="Game name…"
            className="w-full rounded bg-card px-2.5 py-2 text-sm text-text outline-none ring-1 ring-accent"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded bg-accent py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
          >
            + Add Game
          </button>
        )}
      </div>
    </div>
  )
}
