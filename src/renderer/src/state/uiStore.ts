import { create } from 'zustand'

export type MainTab = 'timer' | 'data' | 'about'
export type DialogKind = 'modify' | 'notes' | 'settings' | null

interface UiState {
  activeTab: MainTab
  selected: string | null
  dialog: DialogKind
  dialogTarget: string | null
  contextMenu: { x: number; y: number; target: string | null } | null
  setActiveTab: (tab: MainTab) => void
  setSelected: (name: string | null) => void
  openDialog: (dialog: Exclude<DialogKind, null>, target?: string | null) => void
  closeDialog: () => void
  openContextMenu: (x: number, y: number, target: string | null) => void
  closeContextMenu: () => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'timer',
  selected: null,
  dialog: null,
  dialogTarget: null,
  contextMenu: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelected: (name) => set({ selected: name }),
  openDialog: (dialog, target = null) => set({ dialog, dialogTarget: target }),
  closeDialog: () => set({ dialog: null, dialogTarget: null }),
  openContextMenu: (x, y, target) => set({ contextMenu: { x, y, target } }),
  closeContextMenu: () => set({ contextMenu: null })
}))

export async function selectProfile(name: string | null): Promise<void> {
  useUiStore.getState().setSelected(name)
  await window.api.profiles.select(name)
}
