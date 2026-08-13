import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../../state/profilesStore'
import { toast } from '../../common/Toast'
import { DrawingCanvas } from './DrawingCanvas'
import type { DrawingStroke, Note } from '@shared/notes'
import type { PopoutState } from '@shared/ipcContract'

const BODY_SAVE_DEBOUNCE_MS = 700

export function NoteEditor({
  name,
  note,
  onBack
}: {
  name: string
  note: Note
  onBack: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [title, setTitle] = useState(note.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [body, setBody] = useState(note.body)

  // Pending body text not yet flushed to disk — read by the unmount/back
  // cleanup so a debounced edit is never lost by navigating away right after
  // typing. A ref, not state: it must be current inside a cleanup closure
  // without retriggering the effect that owns it.
  const pendingBodyRef = useRef<string | null>(null)
  const bodyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Switching notes (or the note being renamed/edited elsewhere) must not
  // clobber text mid-keystroke — only resync when the actual note identity
  // changes, matching the "controlled input, external state is the initial
  // value only" shape every other editor in this app already uses.
  const noteId = note.id
  useEffect(() => {
    setTitle(note.title)
    setBody(note.body)
    pendingBodyRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  function flushBody(): void {
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current)
    bodyTimerRef.current = null
    if (pendingBodyRef.current === null) return
    const toSave = pendingBodyRef.current
    pendingBodyRef.current = null
    void window.api.profiles
      .updateNoteBody(name, noteId, toSave)
      .then((profile) => useProfilesStore.getState().upsert(profile))
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
  }

  // Flushes whatever's pending when leaving this note, so closing the dialog
  // or hitting Back right after typing never drops the last debounce window.
  useEffect(() => flushBody, [noteId])

  // L3: which note (if any) currently has its drawing detached into the
  // pop-out window. Only one can exist at a time — see drawingPopout.ts.
  const [popoutState, setPopoutState] = useState<PopoutState | null>(null)
  useEffect(() => {
    void window.api.notes.getPopoutState().then(setPopoutState)
    return window.api.notes.onPopoutStateChanged(setPopoutState)
  }, [])
  const poppedOutHere = popoutState?.name === name && popoutState.noteId === noteId
  const poppedOutElsewhere = popoutState !== null && !poppedOutHere

  async function handlePopOut(): Promise<void> {
    const { opened } = await window.api.notes.openPopout(name, noteId)
    if (!opened) toast.error(t('note_pop_out_busy'))
  }

  function handleBodyChange(value: string): void {
    setBody(value)
    pendingBodyRef.current = value
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current)
    bodyTimerRef.current = setTimeout(flushBody, BODY_SAVE_DEBOUNCE_MS)
  }

  async function commitTitle(): Promise<void> {
    setEditingTitle(false)
    const trimmed = title.trim()
    if (trimmed === note.title) return
    try {
      const profile = await window.api.profiles.renameNote(name, noteId, trimmed)
      useProfilesStore.getState().upsert(profile)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDrawingChange(drawing: DrawingStroke[]): Promise<void> {
    try {
      const profile = await window.api.profiles.updateNoteDrawing(name, noteId, drawing)
      useProfilesStore.getState().upsert(profile)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('confirm_delete_note_msg', { title: note.title.trim() || t('note_untitled') })))
      return
    flushBody()
    try {
      const profile = await window.api.profiles.deleteNote(name, noteId)
      useProfilesStore.getState().upsert(profile)
      onBack()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex h-[65vh] flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            flushBody()
            onBack()
          }}
          className="shrink-0 rounded p-1 text-lg text-subtext transition-colors hover:text-text"
          aria-label={t('btn_back')}
        >
          ←
        </button>
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setTitle(note.title)
                setEditingTitle(false)
              }
            }}
            placeholder={t('note_untitled')}
            className="min-w-0 flex-1 rounded bg-card px-2 py-1 text-sm font-medium text-text outline-none ring-1 ring-accent"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            title={t('note_rename_hint')}
            className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm font-medium text-text transition-colors hover:bg-card/60"
          >
            {title.trim() || t('note_untitled')}
          </button>
        )}
        <button
          onClick={() => void handleDelete()}
          className="shrink-0 rounded px-2 py-1 text-xs text-red transition-colors hover:bg-red hover:text-bg"
        >
          {t('ctx_delete')}
        </button>
      </div>

      {/*
       * L3: while the drawing is popped out, the text zone expands to fill
       * the space it leaves rather than sitting next to an empty column —
       * the drawing genuinely isn't here right now, so pretending there's
       * still a canvas-sized gap for it would be pure wasted space.
       */}
      <div className={`grid min-h-0 flex-1 gap-3 ${poppedOutHere ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder={t('note_body_placeholder')}
          className="h-full min-h-0 w-full resize-none rounded bg-card px-3 py-2 text-sm text-text outline-none"
        />
        {!poppedOutHere && (
          <DrawingCanvas
            strokes={note.drawing}
            onChange={(d) => void handleDrawingChange(d)}
            toolbarExtra={
              <button
                onClick={() => void handlePopOut()}
                disabled={poppedOutElsewhere}
                title={poppedOutElsewhere ? t('note_pop_out_busy') : undefined}
                className="rounded bg-card px-2.5 py-1 text-xs text-subtext transition-opacity hover:text-text disabled:opacity-40"
              >
                {t('note_pop_out')} ⧉
              </button>
            }
          />
        )}
      </div>
      {poppedOutHere && <div className="text-xs text-subtext">{t('note_open_elsewhere')}</div>}
    </div>
  )
}
