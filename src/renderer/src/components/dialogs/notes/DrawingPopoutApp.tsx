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

  async function handleMoveTo(targetId: string): Promise<void> {
    if (targetId === noteId) return
    const target = profile?.noteList.find((n) => n.id === targetId)
    if (target && target.drawing.length > 0) {
      if (!window.confirm(t('confirm_overwrite_drawing_msg', { title: target.title.trim() || t('note_untitled') })))
        return
    }
    setNoteId(targetId) // immediate feedback — onPopoutStateChanged will confirm the same value shortly after
    await window.api.notes.moveDrawing(profileName, noteId, targetId)
    await refresh()
  }

  if (!loaded) return <div className="h-full bg-bg" />

  if (!profile || !note) {
    return (
      <div className="flex h-full items-center justify-center bg-bg p-4 text-center text-sm text-subtext">
        {t('note_popout_gone')}
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
      </div>
      <div className="min-h-0 flex-1">
        <DrawingCanvas strokes={note.drawing} onChange={(d) => void handleDrawingChange(d)} />
      </div>
    </div>
  )
}
