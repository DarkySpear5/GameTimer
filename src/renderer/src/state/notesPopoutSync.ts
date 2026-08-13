import { useProfilesStore } from './profilesStore'

/**
 * The drawing pop-out is a SEPARATE renderer process — saving a stroke there
 * updates the real data (main process owns it either way) but does nothing
 * to the main window's own copy of it in useProfilesStore, which lives in a
 * different JS heap entirely. Without this, closing the pop-out made the
 * main window's canvas revert to whatever it last knew, undoing everything
 * that had just been drawn from the main window's point of view — the data
 * on disk was correct the whole time, only the main window's rendered view
 * was stale.
 *
 * Refetching on every popout-state change (not just close) also covers
 * "Move to note": the main window might be sitting on the note LIST, not the
 * note that was just moved into or out of, and that list's own ✏️ marker
 * needs to catch up too.
 */
let unsubscribe: (() => void) | null = null

export function startNotesPopoutSync(): void {
  if (unsubscribe) return
  unsubscribe = window.api.notes.onPopoutStateChanged(() => {
    void window.api.profiles.list().then((profiles) => useProfilesStore.getState().setAll(profiles))
  })
}
