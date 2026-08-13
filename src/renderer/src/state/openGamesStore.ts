import { create } from 'zustand'

interface OpenGamesState {
  /** Names of every game whose process is currently seen running (process-detected, not the app's own timer). */
  open: Set<string>
}

export const useOpenGamesStore = create<OpenGamesState>(() => ({ open: new Set() }))

let unsubscribe: (() => void) | null = null

export function startOpenGamesSubscription(): void {
  if (unsubscribe) return
  unsubscribe = window.api.detect.onOpenGamesChanged((names) => {
    useOpenGamesStore.setState({ open: new Set(names) })
  })
  void window.api.detect.openGames().then((names) => {
    useOpenGamesStore.setState({ open: new Set(names) })
  })
}
