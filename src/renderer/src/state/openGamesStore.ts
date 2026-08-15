import { create } from 'zustand'

interface OpenGamesState {
  /** Names of every game whose process is currently seen running (process-detected, not the app's own timer). */
  open: Set<string>
  /**
   * Names of open games Stop can't act on — an elevated, anti-cheat-protected
   * process (Nexon/Battle.net/EA, e.g. Vindictus under GameGuard) was only
   * detectable by name, and Windows blocks killing it from this unelevated
   * app regardless of PID. LibraryDetail disables Stop for these rather than
   * offering a button that would silently fail.
   */
  unstoppable: Set<string>
}

export const useOpenGamesStore = create<OpenGamesState>(() => ({ open: new Set(), unstoppable: new Set() }))

let unsubscribe: (() => void) | null = null

export function startOpenGamesSubscription(): void {
  if (unsubscribe) return
  unsubscribe = window.api.detect.onOpenGamesChanged(({ open, unstoppable }) => {
    useOpenGamesStore.setState({ open: new Set(open), unstoppable: new Set(unstoppable) })
  })
  void window.api.detect.openGames().then(({ open, unstoppable }) => {
    useOpenGamesStore.setState({ open: new Set(open), unstoppable: new Set(unstoppable) })
  })
}
