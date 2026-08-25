# Changelog

All notable changes to Gamut (formerly Game Timer) are documented here.

## v3.4.22 — 2026-08-24

### Changed
- Reordered the Data tab columns to put **Time to Beat** before **Time
  Played**. Advanced view now reads: Game, Time to Beat, Time Played,
  Started, Completed On, Status, Rating. Simple view keeps the same leading
  duration order before Status and Rating.

### Fixed
- Gamut now refuses to start when an existing data file cannot be read or
  parsed, instead of treating it as a new empty library. This keeps the
  original game data untouched for recovery.

## v1.9.1 — 2026-07-25

### Fixed
- **Reverted the Data tab back to a single table**, undoing v1.8's
  frozen-column/dual-Treeview experiment. Even after v1.9's alignment fix,
  dragging the horizontal scrollbar didn't move the frozen Game column's
  text in sync with the rest of the row, so the pane split still looked and
  felt broken. The Game column is back to being a normal column in the same
  table as Time Played, Status, Started, Completed On, Time Completed,
  Rating, and Genres — one Treeview, one vertical scrollbar, no independent
  horizontal scroll to fall out of sync.

## v1.9 — 2026-07-25

### Fixed
- **Data tab: the "Game" column header and the row-stripe alignment were
  broken in v1.8's frozen-column rework.** The left (frozen) tree was built
  with `show="tree"` instead of `show="tree headings"`, which hid its header
  row entirely — that both erased the "Game" label and, since the right tree
  still had a header row, shifted every row in the left tree up by one
  header's height relative to the right tree, breaking the alternating
  row-stripe colors between the two panes. Fixed and verified pixel-aligned
  row-for-row, with stripe colors matching, across resizing the window
  smaller and larger.

## v1.8 — 2026-07-25

### Fixed
- **Data tab horizontal scroll now genuinely pins the Game column on the
  left.** The v1.7 claim that ttk.Treeview does this natively was wrong —
  vanilla Tk scrolls the whole row together. It's now two Treeviews kept in
  sync (shared vertical scroll and selection, independent horizontal scroll
  on the data side), which is the correct way to do this in Tkinter.
- **Data tab scrollbars now only appear when there's actually something to
  scroll to**, instead of always showing a trough — auto-hide, appear on
  demand.
- **Settings and Modify's Save/Close buttons no longer get pushed off-screen
  on a short window.** Both windows packed their scrollable notebook before
  the bottom button bar, so the expanding notebook could claim all the space
  and require resizing the window just to see Save. Packing the bottom bar
  first (reserving its space) fixes it — the same ordering rule already used
  for the left panel's Add Game button.

## v1.7 — 2026-07-25

### Added
- **Font size slider** in a new Settings → UI tab — the current size is the
  smallest available, and it scales the whole app's text up from there.
  Profile Icon Size (now a dropdown instead of radio buttons) and the Font
  family picker moved here too.
- **Started date** column in the Data tab: the date a game was first ever
  pressed Play on (date only, no time-of-day).
- **Horizontal scrolling** for the Data tab table, with the Game name column
  staying fixed on the left as the rest scrolls.

### Changed
- **Data tab genres column** now wraps onto up to 3 lines (with "..." if it's
  still too long) instead of one unreadable run-on line.
- **Tray settings merged into the General tab** — it doesn't need its own tab.
- **Accent color** is no longer a separate, confusing control that silently
  overrode Customize Colors' own accent role. It's now purely part of
  Customize Colors, which in turn only works once "Custom" is deliberately
  selected (previously it was editable on top of a preset theme too, which
  silently switched you to Custom on save without choosing that). Existing
  custom accents are migrated automatically — nobody's look changes on
  upgrade.
- **Completed On / Time Completed** in the Data tab now only populate for
  games actually marked Completed — Dropped/On Hold no longer show a
  "completion" date that didn't happen (their own snapshot is still visible
  in Modify's General tab).
- **Reverted** the Complete on/off switch from v1.5/v1.6 back to a plain
  "✓ Complete" button next to Play — still toggles the same status logic
  underneath, just without the phone-settings-style visual.

All of the above is translated across the existing 10 languages.

## v1.6 — 2026-07-24

### Added
- **Dropped and On Hold statuses.** Completed was previously the only way to
  mark a game as "not actively playing" — there's now a real 4-state status
  (Playing / Completed / Dropped / On Hold) with its own snapshot of tracked
  time and date whenever it changes. Set it from the Modify window's General
  tab, now a proper status selector instead of the info-only section it used
  to be. Pressing Play on a Dropped or On Hold game automatically clears the
  status back to Playing (Completed is the one status that survives replay,
  unchanged from v1.4/v1.5's design).
- **Multiple games can run concurrently.** Selecting a different game in the
  list no longer pauses whatever was already running — any number of timers
  can tick at once in the background, each saved independently. A running
  game now shows a ▶ marker and green text in the games list so it's clear
  which ones are active, even if they're not the one currently selected.

### Changed
- **Notes moved back to the right-click menu** as its own popup (right-click
  → Notes), out of the Modify window.
- **The Complete toggle's label** now sits to the left of the switch instead
  of stacked above it (matching a real "Setting Name — [toggle]" phone
  settings row), fixing a legibility complaint with the old layout.
- **The Modify window is wider by default and has a minimum size** so its 4
  tab labels (General / Time / Icon & Background / Genres) can't get shrunk
  into unreadable fragments — this was happening in some languages where the
  translated labels run longer than English.
- **Modify and Settings windows gained a visible resize handle** (bottom-right
  corner) since the actual OS window-edge border is thin and easy to miss.

All of the above is translated across the existing 10 languages.

## v1.5 — 2026-07-24

### Changed — right-click menu decluttered into a "Modify" window
The right-click menu had grown to 13 items. It's now split into two levels:

- **Stayed on the right-click menu:** Modify, Duplicate, Reset Time, Rate Game,
  Export, Import, Delete.
- **Moved into the new Modify window** (right-click → Modify), organized as
  tabs: **General** (Rename, plus Unmark Completed when the game is
  completed), **Time** (the Add/Remove Time controls), **Icon & Background**
  (Change Icon, background color/image/reset), **Genres** (the genre picker),
  and **Notes**.

Notes wasn't explicitly on either list in the request — it fit the "edit this
game's data" theme of the other Modify tabs better than the quick-action list,
so it moved in too.

### Changed — Complete is now an on/off toggle
The "✓ Complete" button under the timer is now a rounded switch (matching the
app's accent color when on), the way phone settings toggles work — flipping
it is its own confirmation, so the "mark as completed?" and "nice work!"
popups are gone. Turning it on still snapshots the Time Completed timestamp
from v1.4; turning it off is the same as Unmark Completed. Falls back to a
plain button if Pillow isn't installed.

All of the above is translated across the existing 10 languages.

## v1.4 — 2026-07-24

### Added
- **Time Completed snapshot.** Marking a game Completed now records the tracked
  total *at that moment* in a new "Time Completed" column in the Data tab,
  separate from "Time Played" — which keeps counting if you play the game
  again afterward (e.g. post-game content, a replay). Re-confirming
  completion on an already-completed game re-snapshots this timestamp.
- **Duplicate** (right-click a game) — clones a profile's tracked time,
  icon, background, genres, notes, and rating into a new entry ("Name
  (Copy)", numbered on repeat), for tracking separate playthroughs.
- **Unmark Completed** (right-click a completed game) — clears the
  completed status and its Time Completed snapshot without touching your
  tracked play time, in case Complete was pressed by mistake.

All three additions are translated across all 10 languages.

## v1.3 — 2026-07-24

### Added
- **Star ratings.** Right-click a game → Rate Game to give it 0-5 stars. Shows
  up next to the timer for the selected game, as a new Rating column in the
  Data tab, and as a new "Rating (Highest first)" sort option. Fully
  translated across all 10 languages.
- **Remove Time.** The time-entry dialog (right-click → Add / Remove Time) now
  has an Add/Remove toggle, so a mis-logged session can be corrected in the
  same place instead of only ever being able to add time. Removing never
  takes a game's total below zero.

### Fixed
- **Popup dialogs (Settings, Add/Remove Time, Notes, genre picker, background
  picker, color customizer) now open centered over the main window** instead
  of wherever the window manager's default placement happened to land them
  (usually the top-left corner of the monitor).

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
