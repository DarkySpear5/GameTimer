import { randomUUID } from 'crypto'
import { emptyNote } from '@shared/notes'
import type { AppData } from '@shared/types'

/**
 * Folds the pre-L1 single `notes: string` field into a one-item noteList,
 * once per profile. Detected by an empty noteList alongside non-empty legacy
 * text — a game that already has notes, or never had any text at all, needs
 * nothing done.
 *
 * The legacy field is left in place rather than cleared: it is still what a
 * pre-L1 .gtprofile export carries (see gtprofile.ts), and zeroing it here
 * would make re-importing that same old export later silently lose the text
 * instead of just folding it in again harmlessly.
 */
export function migrateLegacyNotes(data: AppData): boolean {
  let changed = false
  const now = Date.now()
  for (const profile of Object.values(data.profiles)) {
    if (profile.noteList.length > 0 || !profile.notes.trim()) continue
    const note = emptyNote(randomUUID(), 'Note', now)
    note.body = profile.notes
    profile.noteList = [note]
    changed = true
  }
  return changed
}
