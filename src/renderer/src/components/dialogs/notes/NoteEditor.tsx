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

  // The drop zone the pop-out can be dragged onto — this exact box, whether
  // it's currently showing a live canvas or the placeholder, not "anywhere
  // on the app window" (measured correctly but felt imprecise to use: a
  // whole small window dragged onto a whole big one). NotesDialog already
  // reports WHICH note is on screen (setViewedNote, including the list-view
  // case this component never sees); this effect owns the other half —
  // exactly WHERE that note's drawing lives on screen — since only the
  // component that actually renders the box can measure it.
  const dropZoneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function reportZone(): void {
      const el = dropZoneRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      window.api.notes.setDropZone({ x: r.x, y: r.y, width: r.width, height: r.height })
    }
    reportZone()

    // Two listeners because either can move/resize this box without the
    // other firing: ResizeObserver catches the element's own size changing,
    // window 'resize' catches the modal recentring at the same size when
    // only the OS window itself resizes.
    const observer = new ResizeObserver(reportZone)
    if (dropZoneRef.current) observer.observe(dropZoneRef.current)
    window.addEventListener('resize', reportZone)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', reportZone)
      window.api.notes.setDropZone(null)
    }
  }, [name, noteId])

  const [dropHover, setDropHover] = useState(false)
  useEffect(() => window.api.notes.onDropZoneHover(setDropHover), [])

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

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder={t('note_body_placeholder')}
          className="h-full min-h-0 w-full resize-none rounded bg-card px-3 py-2 text-sm text-text outline-none"
        />
        {/*
         * L3's drop target — this exact box, whether it's a live canvas or
         * (while popped out) the placeholder below. ref is on the OUTER div
         * deliberately: DrawingCanvas has its own internal padding/toolbar
         * layout, and measuring a wrapper around it is what keeps the
         * reported rect matching what the user actually sees as "the
         * drawing area", independent of that internal layout.
         */}
        <div
          ref={dropZoneRef}
          data-testid="note-drop-zone"
          className={`min-h-0 rounded-lg transition-shadow ${
            dropHover ? 'shadow-[0_0_0_3px_var(--gt-accent)]' : ''
          }`}
        >
          {poppedOutHere ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-card bg-card/20 p-4 text-center text-xs text-subtext">
              <span className="text-lg">⧉</span>
              {t('note_open_elsewhere')}
              <span className="text-[0.65rem] opacity-70">{t('note_drag_back_hint')}</span>
            </div>
          ) : (
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
      </div>
    </div>
  )
}
