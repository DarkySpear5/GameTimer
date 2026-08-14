import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { NoteList } from './notes/NoteList'
import { NoteEditor } from './notes/NoteEditor'

/**
 * L1: a list of notes, not one text box — Outlook/Keep shaped. This
 * component only routes between the list and one open note; both do their
 * own saving, so there is nothing left here to save on close.
 */
export function NotesDialog({ name, onClose }: { name: string; onClose: () => void }): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)

  if (!profile) return null

  // The open note can vanish out from under this view (deleted from another
  // window, or this same one's own Delete button) — falling back to the list
  // is the real path, not a defensive nicety, same reasoning as Library's
  // detail page handling a profile disappearing.
  const openNote = openNoteId ? profile.noteList.find((n) => n.id === openNoteId) : null

  // L3: tells main which note (if any) is on screen right now, so a
  // drag-drop reattach of the pop-out can target THIS note instead of always
  // reattaching to wherever it came from. Cleared on every path out of a
  // note — Back, Delete, and unmounting (dialog closed) alike — so a stale
  // value can never linger as a merge target once nobody is actually looking
  // at that note anymore.
  useEffect(() => {
    window.api.notes.setViewedNote(openNote ? { name, noteId: openNote.id } : null)
    return () => window.api.notes.setViewedNote(null)
  }, [name, openNote?.id])

  return (
    <Modal title={t('dlg_notes_title', { name: profile.name })} onClose={onClose} width="max-w-2xl">
      {openNote ? (
        <NoteEditor name={name} note={openNote} onBack={() => setOpenNoteId(null)} />
      ) : (
        <NoteList name={name} notes={profile.noteList} onOpen={setOpenNoteId} />
      )}
    </Modal>
  )
}
