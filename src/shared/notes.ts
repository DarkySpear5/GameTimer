/**
 * L1/L2: a game can hold many notes (Outlook/Keep shaped — a list of titled
 * entries, not one text box), and each note carries an optional drawing
 * alongside its text.
 */

/**
 * One pen stroke, stored as normalized (0..1) points rather than pixels — the
 * canvas resizes (windowed vs. popped-out, different monitor DPI), and a
 * pixel-space stroke would warp or clip when the surface it was drawn on
 * changes size. Color is captured per-stroke rather than read from the
 * current theme at render time, so a stroke drawn in light-on-dark stays
 * legible even after the user switches themes later.
 */
export interface DrawingStroke {
  points: { x: number; y: number }[]
  color: string
  width: number
}

export interface Note {
  id: string
  title: string
  body: string
  drawing: DrawingStroke[]
  createdAt: number
  updatedAt: number
}

export function emptyNote(id: string, title: string, now: number): Note {
  return { id, title, body: '', drawing: [], createdAt: now, updatedAt: now }
}
