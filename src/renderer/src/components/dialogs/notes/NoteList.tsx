import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../../state/profilesStore'
import { toast } from '../../common/Toast'
import type { Note } from '@shared/notes'

/** L1: the list view — Outlook/Keep shaped. Newest note first, in creation order; editing a note never reorders the list. */
export function NoteList({
  name,
  notes,
  onOpen
}: {
  name: string
  notes: Note[]
  onOpen: (noteId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()

  async function handleCreate(): Promise<void> {
    try {
      const profile = await window.api.profiles.createNote(name)
      useProfilesStore.getState().upsert(profile)
      onOpen(profile.noteList[0].id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => void handleCreate()}
        className="flex items-center justify-center gap-1.5 rounded bg-accent py-2 text-sm font-medium text-bg hover:opacity-90"
      >
        <span className="text-base leading-none">+</span>
        {t('note_new')}
      </button>

      {notes.length === 0 ? (
        <div className="py-8 text-center text-sm text-subtext">{t('note_list_empty')}</div>
      ) : (
        <div className="flex flex-col gap-1">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => onOpen(note.id)}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-card/60"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-text">
                {note.title.trim() || t('note_untitled')}
              </span>
              {note.drawing.length > 0 && (
                <span className="shrink-0 text-xs text-subtext" title={t('note_has_drawing')}>
                  ✏️
                </span>
              )}
              <span className="shrink-0 text-xs text-subtext">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
