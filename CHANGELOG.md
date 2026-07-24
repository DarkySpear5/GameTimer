# Changelog

All notable changes to Game Timer are documented here.

## v1.2 — 2026-07-24

### Added
- **10 languages** — English, French, Spanish, Russian, Japanese, Korean, Italian,
  German, Portuguese (Brazil), and Chinese (Simplified). Switch anytime from the
  gear icon → Settings → Language; genre names, dialogs, menus, and messages are
  all translated. Missing translations fall back to English rather than showing
  a blank label.
- **Add Play Time** — log time you spent playing elsewhere (another device, a
  split session) straight from the right-click menu, with an optional note.
- **Notes** — a per-game notes field (right-click → Notes), so the entries logged
  by Add Play Time are actually visible and editable afterward.
- **About tab** now has a GitHub link back to this repo alongside the existing
  Discord contact.

## v1.1 — 2026-07-23

### Fixed
- **Data tab now respects the Games list's Sort setting.** Previously it iterated
  profiles in raw insertion order, so renaming a game (which re-inserts it at
  the end internally) could silently reshuffle its row in the Data tab with no
  relation to name, last-played, or genre order.
- **Filtering the Games list to a genre with no matches no longer shows a
  blank, unexplained list.** It now shows a "No games match genre '...'"
  message (or "No games yet" if you have no profiles at all).
- **Dragging to resize the window with a custom background image set no
  longer re-reads and re-decodes the image file from disk on every resize
  event.** The decoded image is now cached per file path and only re-cropped/
  re-scaled on resize, which should make resizing feel smoother with large
  background images.

### Added
- **Daily backup snapshots.** Game Timer now keeps a rolling set of daily
  copies of `game_timer_data.json` in a new `backups/` folder next to the
  program, pruned after 14 days. The existing atomic save (write to a temp
  file, then replace) already protected against corruption from a crash
  mid-write, but not against a wrong click on "Reset Time" or a bad Import —
  this gives tracked play time, which can't be regenerated, a way back.
