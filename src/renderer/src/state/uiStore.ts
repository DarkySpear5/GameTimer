import { create } from 'zustand'

export type MainTab = 'timer' | 'data' | 'about'
export type DialogKind = 'modify' | 'notes' | 'settings' | 'info' | null

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
  setActiveTab: (tab: MainTab) => void
  setSelected: (name: string | null) => void
  openDialog: (dialog: Exclude<DialogKind, null>, target?: string | null) => void
  closeDialog: () => void
  openContextMenu: (x: number, y: number, target: string | null) => void
  closeContextMenu: () => void
  setDataSort: (sort: DataSort) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'timer',
  selected: null,
  dialog: null,
  dialogTarget: null,
  contextMenu: null,
  dataSort: { key: 'name', dir: 'asc' },
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelected: (name) => set({ selected: name }),
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
