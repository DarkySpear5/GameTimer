import { create } from 'zustand'

export type MainTab = 'timer' | 'data' | 'about'

interface UiState {
  activeTab: MainTab
  selected: string | null
  setActiveTab: (tab: MainTab) => void
  setSelected: (name: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'timer',
  selected: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelected: (name) => set({ selected: name })
}))

export async function selectProfile(name: string | null): Promise<void> {
  useUiStore.getState().setSelected(name)
  await window.api.profiles.select(name)
}
