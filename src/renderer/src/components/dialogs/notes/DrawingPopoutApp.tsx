import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DrawingCanvas } from './DrawingCanvas'
import { applyThemeToDocument } from '../../../state/settingsStore'
import type { Profile } from '@shared/types'
import type { DrawingStroke } from '@shared/notes'

/**
 * L3: the whole content of the pop-out window — opened by drawingPopout.ts at
 * index.html#drawing-popout?profile=...&note=.... A separate tiny "app"
 * rather than reusing NoteEditor: this window's only job is the canvas, none
 * of the surrounding dialog chrome applies, and it needs its own theme
 * bootstrap since it's a fresh renderer with no state carried over from the
 * main window.
 */
export function DrawingPopoutApp(): React.JSX.Element {
  const { t } = useTranslation()
  const params = new URLSearchParams(window.location.search)
  const profileName = params.get('profile') ?? ''

  const [noteId, setNoteId] = useState(params.get('note') ?? '')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function refresh(): Promise<void> {
    const data = await window.api.app.getInitialData()
    setProfile(data.profiles[profileName] ?? null)
  }

  useEffect(() => {
    void (async () => {
      const data = await window.api.app.getInitialData()
      applyThemeToDocument(data.settings)
      setProfile(data.profiles[profileName] ?? null)
      setLoaded(true)
    })()
    // The main window can move this pop-out to a different note (or close
    // it) — this is what keeps the two in sync without polling.
    return window.api.notes.onPopoutStateChanged((state) => {
      if (state && state.name === profileName) setNoteId(state.noteId)
    })
  }, [profileName])

  const note = profile?.noteList.find((n) => n.id === noteId) ?? null

  useEffect(() => {
    document.title = note?.title.trim() || t('note_untitled')
  }, [note?.title, t])

  async function handleDrawingChange(drawing: DrawingStroke[]): Promise<void> {
    const updated = await window.api.profiles.updateNoteDrawing(profileName, noteId, drawing)
    setProfile(updated)
  }

  /** Returns whether the move actually happened — false means the user cancelled the overwrite confirm, or it was already a no-op. Read by the drag-drop handler below to decide whether to close the window afterward. */
  async function handleMoveTo(targetId: string): Promise<boolean> {
    if (targetId === noteId) return false
    const target = profile?.noteList.find((n) => n.id === targetId)
    if (target && target.drawing.length > 0) {
      if (!window.confirm(t('confirm_overwrite_drawing_msg', { title: target.title.trim() || t('note_untitled') })))
        return false
    }
    setNoteId(targetId) // immediate feedback — onPopoutStateChanged will confirm the same value shortly after
    await window.api.notes.moveDrawing(profileName, noteId, targetId)
    await refresh()
    return true
  }

  /**
   * A settled drag-drop landed on the drop zone — see drawingPopout.ts for
   * how "landed on" is detected. Reattaching to the pop-out's OWN note needs
   * no confirm (it never left); moving to a DIFFERENT note reuses
   * handleMoveTo verbatim, so the confirm and the actual move behave
   * identically to using the dropdown. Either way, a successful drop fades
   * the window out and closes it — the "merging into the note" animation —
   * rather than the instant window.close() the escape hatch uses, which
   * deliberately stays instant and independent of this whole flow.
   */
  useEffect(() => {
    return window.api.notes.onDropDetected((targetNoteId) => {
      void (async () => {
        const moved = targetNoteId === noteId ? true : await handleMoveTo(targetNoteId)
        if (moved) window.api.notes.closePopoutWithFade()
      })()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, profile])

  /**
   * The literal fix for the fullscreen lockout is fullscreenable: false on
   * the BrowserWindow (see drawingPopout.ts) — this window should never be
   * ABLE to enter that state at all. This is the belt-and-suspenders on top:
   * a plain DOM window.close() (which Electron maps onto closing the actual
   * BrowserWindow, no IPC needed) behind a control that's visible in every
   * state this component can render, plus Escape as a keyboard shortcut for
   * the same thing. If fullscreenable ever gets bypassed by some OS/Electron
   * edge case, there is still a way out that doesn't require knowing Alt+F4.
   */
  function handleClose(): void {
    window.close()
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const closeButton = (
    <button
      onClick={handleClose}
      title={t('note_popout_close_hint')}
      className="shrink-0 rounded px-2 py-1 text-sm text-subtext transition-colors hover:bg-red hover:text-bg"
    >
      ✕
    </button>
  )

  if (!loaded) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <div className="flex justify-end p-1">{closeButton}</div>
      </div>
    )
  }

  if (!profile || !note) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <div className="flex justify-end p-1">{closeButton}</div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-subtext">
          {t('note_popout_gone')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2 bg-bg p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
          {note.title.trim() || t('note_untitled')}
        </span>
        {profile.noteList.length > 1 && (
          <select
            value={noteId}
            onChange={(e) => void handleMoveTo(e.target.value)}
            title={t('note_move_to_hint')}
            className="max-w-[45%] shrink-0 rounded bg-card px-2 py-1 text-xs text-text outline-none"
          >
            {profile.noteList.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title.trim() || t('note_untitled')}
              </option>
            ))}
          </select>
        )}
        {closeButton}
      </div>
      <div className="min-h-0 flex-1">
        <DrawingCanvas strokes={note.drawing} onChange={(d) => void handleDrawingChange(d)} />
      </div>
    </div>
  )
}
