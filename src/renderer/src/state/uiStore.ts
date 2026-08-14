import { create } from 'zustand'

/**
 * `library` is first and is the default: it answers "what do I have", which is
 * the question someone opening the app for the first time actually has.
 */
export type MainTab = 'library' | 'stats' | 'profileStats' | 'about'
export type DialogKind =
  | 'modify'
  | 'notes'
  | 'screenshots'
  | 'settings'
  | 'info'
  | 'add'
  | 'installed'
  /** Add/Remove time alone — the Timer tab's one editing action. See AdjustTimeDialog. */
  | 'time'
  | null

/** Which Data-tab column the table is ordered by. Genres is deliberately absent — a set of tags has no meaningful order. */
export type DataSortKey =
  | 'name'
  | 'seconds'
  | 'status'
  | 'startedDate'
  | 'completedOn'
  | 'completedTime'
  | 'rating'

export interface DataSort {
  key: DataSortKey
  dir: 'asc' | 'desc'
}

interface UiState {
  activeTab: MainTab
  selected: string | null
  dialog: DialogKind
  dialogTarget: string | null
  contextMenu: { x: number; y: number; target: string | null } | null
  // Lives up here rather than in DataTab's own useState because App unmounts
  // the whole tab when you switch away from it — local state would silently
  // throw away the column you picked every time you flip to Timer and back.
  dataSort: DataSort
  /**
   * Which game's detail page is open inside Library, or null for the grid/list.
   * Deliberately separate from `selected`: `selected` is what the Timer tab is
   * pointed at, and browsing the Library must not retarget the timer. Only
   * launching or pressing Play does that.
   */
  libraryFocus: string | null
  setActiveTab: (tab: MainTab) => void
  setSelected: (name: string | null) => void
  setLibraryFocus: (name: string | null) => void
  openDialog: (dialog: Exclude<DialogKind, null>, target?: string | null) => void
  closeDialog: () => void
  openContextMenu: (x: number, y: number, target: string | null) => void
  closeContextMenu: () => void
  setDataSort: (sort: DataSort) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'library',
  selected: null,
  dialog: null,
  dialogTarget: null,
  contextMenu: null,
  dataSort: { key: 'name', dir: 'asc' },
  libraryFocus: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelected: (name) => set({ selected: name }),
  setLibraryFocus: (name) => set({ libraryFocus: name }),
  openDialog: (dialog, target = null) => set({ dialog, dialogTarget: target }),
  closeDialog: () => set({ dialog: null, dialogTarget: null }),
  openContextMenu: (x, y, target) => set({ contextMenu: { x, y, target } }),
  closeContextMenu: () => set({ contextMenu: null }),
  setDataSort: (sort) => set({ dataSort: sort })
}))

export async function selectProfile(name: string | null): Promise<void> {
  useUiStore.getState().setSelected(name)
  await window.api.profiles.select(name)
}

/**
 * The single transition from Library to Timer. Clicking a game in Library only
 * opens its detail page — launching is the moment you stop browsing and start
 * playing, so it is the one action that retargets the Timer tab and switches
 * to it.
 *
 * The tab switch happens before the launch resolves on purpose: starting a game
 * through Steam can take a noticeable moment, and a button that appears to do
 * nothing until the game is up reads as broken.
 */
export async function launchGame(name: string): Promise<void> {
  await selectProfile(name)
  await window.api.detect.launch(name)
}

/** Kills the game's process. The caller is responsible for confirming with the user first. */
export async function stopGame(name: string): Promise<void> {
  await window.api.detect.stop(name)
}
