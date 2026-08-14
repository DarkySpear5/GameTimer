# Gamut v3 — punch list

The user's list from 2026-08-08, after testing the multi-launcher build. Work it
**in order, one item at a time**. Nothing outside this list gets done until it
is finished; new findings are appended, not inserted ahead. Linux support is
last and deliberately so — it is the cherry, not a prerequisite.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done

---

## A. Art fetching

- [x] **A1. SteamGridDB as the art source for non-Steam games.**
  Settings → Launchers gets `SteamGridDB API key: [__________]` with a note
  directly beneath: *"for non-Steam icon/background fetch from SteamGridDB"*.
  Used for Nexon / Epic / Xbox / EA / Battle.net games.
  Note: this is a deliberate, user-supplied exception to the "no API key" rule
  in roadmap §2.2 — the key is the *user's own*, entered by them, not shipped.

## B. Launching (all measured broken on real games)

- [~] **B1. Vindictus** — DEPRIORITIZED 2026-08-13, moved to low priority (see
  bottom of file). Shows "Loading Nexon Launcher…" then nothing happens.
  `nxl://launch/10300` is the real URI read off the user's own shortcut
  (confirmed correct), so this isn't a wrong-ID bug — it looks like the Nexon
  Launcher's own cold-start behavior. Needs a live repro before guessing at a
  fix; not worth the token spend until the rest of the list is done.
- [x] **B2. Xbox games have no Launch Game button at all** (no `.exe`, so the
  button's `canLaunch` test fails — it must accept `launchUri` too).
- [~] **B3. Heroes of the Storm** — DEPRIORITIZED 2026-08-13, moved to low
  priority (see bottom of file). Same "needs a live repro" situation as B1.
- [x] **B4. Rocket League timer** — starts after the first EasyAntiCheat splash,
  then a second EAC process opens and the timer PAUSES and never resumes.
- [x] **B5. Closing a game does not stop the timer** (possibly all games, or
  only launcher-fronted ones — needs checking).

## C. Structure

- [x] **C1. Remove the Timer tab entirely.** It is redundant: Library already
  holds everything, and clicking a game shows its timer.
  (Supersedes the earlier "add sort/filter to Timer" and "add a search bar to
  Timer" requests — both are void once the tab is gone.)
- [x] **C2. Search bar in Library.**
- [x] **C3. Sort by platform in Library** — Steam → Xbox → Epic → EA → GOG → …

## D. Game actions

- [x] **D1. Add "Reset time"** to Modify → Time, under the time.
- [x] **D2. Remove "Note (optional)"** from Modify → Time.
- [x] **D3. Remove "Duplicate"** everywhere.
- [x] **D4. Add "Import"** to a focused game in Library (Export exists, Import
  does not).
- [ ] **D5. Notes become a multi-note list** — a `+` button, renameable notes, a
  list view showing note names, click to open, back arrow to return. Outlook /
  Google Keep shaped. One game can have many notes.

## E. Library presentation

- [x] **E1. "Profile Icon Size" → "Icon Size"**, and make it control the
  Library **list** mode's icons.
- [x] **E2. List mode must show the ICON, not the background image.**
- [x] **E3. Add Game dialog needs the Scan button.**
- [x] **E4. Right-click menu at the bottom of the Library runs off-screen** —
  options below the window edge are unreachable, so a game can't be deleted.

## F. Stats

- [x] **F1. Exclude `not_started` games from Stats.**
- [x] **F2. Detail level becomes a button inside the Stats window.** It shows
  the level you would switch TO: labelled "Advanced" while Simple is active,
  "Simple" while Advanced is active. Remove the setting from Settings → Games.

## G. Settings

- [x] **G1. Tab order: General → Launchers → Games → Appearance → Language.**
- [x] **G2. Font picker becomes a dropdown** (keep the search box inside it).
- [x] **G3. "Data table size" → "Stats table size".**
- [x] **G4. Font size range 0.7x – 1.5x.**
- [x] **G5. "Watch for games in the background" is meaningless to a reader** —
  clarify the label, or explain what it does, or both.

## H. About

- [x] **H1. Credit the sources used for icon/background fetching.**

## I. Session/data integrity bugs (found 2026-08-13)

- [x] **I1. Idle time missing for some users in Advanced mode.** Root cause: the
  whole open/idle block was gated on `openSeconds > 0`, and `openSeconds` only
  accumulates when the watcher sees a game close — so with background watching
  off it is always 0 and the block silently vanished. Turning Advanced on
  specifically to see idle time and getting nothing read as broken. Now the
  block always renders under Advanced, and when there is no figure it says why
  (watching off vs. nothing measured yet).
- [x] **I2. Session count/total/average mismatch after a crash.** Root cause:
  `sessionStats` was only ever written by `timerEngine.pause()`. A crash means
  pause never runs, so the session's TIME still landed in `seconds` via the 5s
  checkpoint but the SESSION was lost entirely — hence 2 real runs showing as
  1, "average session" silently becoming "length of the last clean session",
  and a total that didn't reconcile. Fixed with a durable `activeSession`
  marker written on start and advanced by the same checkpoint that commits the
  seconds; on next load an unfinished marker is folded into the totals,
  credited only up to its last checkpoint (never to now, since the gap to the
  next launch could be days). 7 unit tests in `recoverSession.test.ts`.
- [x] **I3. "Reset time" doesn't reset game info.** Now clears sessionStats,
  sessionLog, openSeconds, launches, lastPlayed and startedDate along with
  `seconds` — everything MEASURED. Art, genres, rating, notes, status and the
  exe link stay: it resets what was measured, not what the game is. Resetting
  mid-session also restarts the in-flight session, which previously would have
  written a session longer than the playtime the reset just cleared.

## J. Game actions and Library polish (found 2026-08-13)

- [x] **J1. Launch Game button becomes Stop Game while the game's process is
  actually running** (process-detected, not just the app's own timer), styled
  as a destructive action. Clicking it prompts "Are you sure you want to close
  the game? Please save all your data first, or it might be lost." before
  killing the process.
- [x] **J2. Add Game (scan) needs Select All / Unselect All.** Already present.
- [x] **J3. Scan dialog's "Add X game" button is hidden below the fold on a
  small window.** Modal gained a `footer` slot pinned below the scrolling body,
  so a dialog's confirm button can never scroll out of reach; the scan dialog's
  actions moved into it.
- [x] **J6. Library detail's Modify / More info / Notes / Export / Import and
  the red Delete get CLIPPED when the window is short.** Root cause was one
  missing `min-h-0`: a flex item defaults to `min-height:auto` and refuses to
  shrink below its content, so the tab container grew past the window and its
  `overflow-hidden` cut the bottom off — with no scrollbar to reach it. Same
  latent bug fixed in Library browse, Stats and About.
- [x] **J4. Loading animation for any async app action**, so a slow operation
  doesn't read as a freeze. Shared `Spinner` component, wired into every
  currently-silent busy/scanning state: the running-apps picker (initial scan
  and the identify/classify round trip after picking), the installed-games
  scan and its Add button, Add Game's confirm/manual submit buttons, the v1
  legacy import's Import button, and Modify → Appearance's Re-fetch art
  button. Verified against the real app: the spinner is visible immediately
  when Detect running game scan starts.
- [x] **J5. "Open .exe directory" button** per game. Shows the .exe selected
  in Explorer; falls back to the install folder for a Steam/Store game with no
  exe on disk. Only appears when there's somewhere for it to go. Verified
  against the real app: present for a linked game, absent for a manual one.

## K. Stats restructure (found 2026-08-13)

- [x] **K1. Split Stats into two tabs: "Game Stats" (per-game, what F1/F2
  already cover) and a new "Profile Stats"** (account-wide: total active time,
  total idle time, both also as a %; hours per genre, also as a %). Profile
  Stats excludes Not Started games (matches F1). A multi-genre game's full
  playtime counts toward EVERY genre it carries — same non-exclusive tagging
  Gamut already uses everywhere else — so genre percentages can and do sum
  past 100%, by design. "Your Stats" title/tab renamed to "Game Stats" to
  match. Verified against the real app with a mixed library (two genres on
  one game, one untracked game, one Not Started).
- [x] **K2. More Info is always Advanced** — the Settings → Games toggle was
  already gone (F2 removed it); this was the second half: More Info no longer
  reads `detailLevel` at all, so it can't be affected by Game Stats' own
  switch. Verified against the real app: Launches, longest session and the
  open/idle block all show in More Info with Game Stats left on Simple.
- [x] **K3. Move the right-click/options entry point above the fold** — next to
  total time played, not below the game list where it needs scrolling. Was
  below the table; now sits between the stat cards and the table, so it's on
  screen for any list longer than a handful of rows without scrolling.

## L. Notes rewrite (found 2026-08-13, expands D5) — DONE 2026-08-13

- [x] **L1. Multi-note list per game** — `+ New note`, click a title to
  rename it in place, list view (title + a ✏️ marker for notes with a
  drawing), back arrow to return. Outlook/Google Keep shaped. The legacy
  single `notes` string is folded into a one-item list once, on load or
  import, and kept (not cleared) as the source of truth for older exports.
- [x] **L2. Each note is split left/right: text on the left, a live drawing
  canvas on the right.** Canvas background matches the active theme (reads
  `--gt-card`); default pen color is whichever of black/white contrasts with
  it, plus a 4-color palette. Strokes are stored as normalized 0..1 points,
  not a baked image, so they redraw correctly at any canvas size.
- [x] **L3. The drawing canvas can pop out into its own resizable window** —
  the note's text zone expands to fill the space it leaves. First pass shipped
  a click-only fallback (dropdown + auto-reattach-on-close) after wrongly
  assuming drag-position tracking was unverifiable here. The user tried it,
  didn't like it, and asked for the real thing — turned out buildable after
  all: Electron fires the same native 'move' event for a scripted
  `setBounds()` sequence as for an actual OS drag (both go through
  WM_WINDOWPOSCHANGED on Windows), so it could be driven AND verified.
  Rebuilt properly: dragging the pop-out onto the main window and letting go
  reattaches it; if the main window has a DIFFERENT note of the same game
  open, it offers to move the drawing there instead, with the same
  overwrite-confirm the dropdown gives (kept, alongside the drag, as a
  non-drag alternative). Only one pop-out can exist at a time.

  Two real bugs the user found by hand, neither test suite had caught:
  - **Fullscreen lockout.** The pop-out could be driven into OS fullscreen
    (no frame, no taskbar, no visible way out) with no code path that put it
    there deliberately — some default Electron/OS trigger. Fixed at the root
    (`fullscreenable: false`, so the window can no longer enter that state by
    any path) plus a belt-and-suspenders escape hatch: an always-visible ✕
    and Escape-to-close, present in every state the window can render,
    so a similar trap can't happen again even from an unanticipated cause.
  - **Stale main-window view after closing the pop-out.** The pop-out is a
    separate renderer process; saving a stroke there updated the real data
    (main process owns it either way) but never told the main window's own
    copy of that data to refresh, so its canvas reverted to whatever it last
    knew instead of showing what was just drawn — data on disk was correct
    the whole time, only the rendered view was stale. Fixed with a small
    global subscription (`notesPopoutSync`) that refetches whenever the
    pop-out's state changes at all, which also covers the list view's ✏️
    marker staying current after a "Move to note".

All three verified against the real packaged app throughout (not a browser
approximation — the same lesson from the earlier layout-bug chase this
session, twice reconfirmed): 25 checks on the base CRUD/list/canvas/pop-out
flow, plus 8 more once the user's reports landed — the exact stale-sync
repro (draw / pop out / draw / close / draw again, all four strokes
required present), fullscreenable verified false, drag-to-reattach onto the
main window, and drag onto a different note triggering the same
overwrite-confirm the dropdown uses (same code path, not a duplicate one —
the first attempt at the confirm used Electron's native `dialog` API in
main, which is invisible to a renderer-side test harness; rebuilt so the
pop-out's own renderer decides and confirms, reusing the dropdown's already-
tested handleMoveTo instead of a second, differently-behaved implementation).

**Third pass, same day:** the drag worked but felt imprecise — dragging a
small window onto the whole large app window, with no feedback about where
exactly counted. Narrowed to a specific zone: NoteEditor now reports its
actual drawing-area rect (live canvas or the placeholder, whichever is
showing) to main via a ResizeObserver + window-resize watcher, converted to
screen coordinates using the main window's CURRENT position at comparison
time — the renderer only has to re-report when the zone's own size changes,
not track the window being moved around separately. The zone highlights
(accent-colored ring) while the pop-out is dragged over it, live during the
drag via the same undebounced 'move' event, not only after release. A
successful drop now fades the pop-out's opacity out before closing it — the
"merging into the note" animation — while the escape hatch (✕ / Escape)
stays a plain instant `window.close()`, deliberately independent of that
fade so it can never be slowed down by it. Also replaced the vestigial
single-line placeholder text with an actual bordered box sized to match
where the canvas normally sits, both for the drop target's own sake and
because a specific box reads as "drop here" in a way a line of text doesn't.

Re-verified end to end: a title-bar drag (well inside the app window, well
outside the zone) now correctly does nothing — proof the narrowing is real,
not just documentation — while a drag onto the actual zone still hovers,
highlights, and reattaches exactly as before. 9 checks total for this pass.

**Fourth pass, same day — three more real gaps, all user-found:**
- **Maximizing the pop-out merged it.** The maximize button (or double-
  clicking its title bar) fires the same 'move'/'resize' events a drag does,
  and trivially overlaps the drop zone once it covers the whole screen —
  clicking maximize to get more drawing room is not a request to reattach.
  `isMaximized()` is the exact signal that tells the two apart: a real drag
  onto the zone can never leave the window in that state, so both the hover
  highlight and the settle-triggered merge now check and skip it.
- **Dragging onto a DIFFERENT GAME's note editor silently did nothing.**
  `moveDrawing` only ever supported moving within one profile's note list, so
  a cross-game target lookup failed closed with neither a merge nor a
  confirm. Generalized to accept two profile names (same-profile moves —
  the dropdown's only case — still work identically, just as a same-name
  call); the pop-out's own identity (which game, which note) is now state
  instead of fixed from the URL it opened with, since a cross-game move
  changes what it's showing, not just which note within one game.
- **No eraser.** Whole-stroke removal (click/drag over a stroke deletes it),
  not partial pixel erasing — fits the vector storage far better than
  rasterizing would, and is a straightforward filter over `strokes` by
  proximity to the cursor in normalized space. Redraws from a local working
  copy immediately rather than waiting on the save round trip, matching the
  pen's already-instant feedback.

10 more checks: the exact maximize repro (still open afterward, despite
covering the zone), a cross-game drag whose confirm names both the target
note AND the target game, both profiles' data landing correctly on either
side of the move, and the eraser removing precisely the stroke it touches
while leaving a second, untouched one intact — plus confirming the pen still
works normally after toggling the eraser back off. 34 + 9 + 10 = 53 checks
across all four passes of L3 today; every earlier pass's suite re-run clean
alongside each new one.

## M. Keybinds (found 2026-08-13) — DONE 2026-08-14

- [x] **M1. Settings → Keybinds tab.**
- [x] **M2. Rebindable commands: start/pause timer, save screenshot.** Combos
  only (never a single key) — first key forced to Shift/Ctrl/Alt/Tab, e.g.
  `Ctrl+2`, `Alt+F1`, `Alt+Home`; a 3-key combo is allowed if it starts
  `Ctrl+Tab+…`-style with the first two fixed.

  Global (system-wide) hotkeys via `globalShortcut`, acting on whichever
  tracked, linked game's window currently has OS focus — resolved via a new
  `foregroundWindow.ts` (single PowerShell shell-out for exe path/title/
  bounds, same `execFile` pattern `processes.ts` already used) shared by M,
  N, and O alike. Design spec + implementation plan at
  `docs/superpowers/specs/2026-08-13-keybinds-screenshots-overlay-design.md`
  and `docs/superpowers/plans/2026-08-13-keybinds-screenshots-overlay.md`.

  **M2 extended same day**: a third keybind, Toggle Overlay (default
  `Ctrl+F11`), added live while diagnosing the O1 bug below — the user
  wanted a fast way to flip the overlay without going through Settings.

## N. Screenshots (found 2026-08-13) — DONE 2026-08-14

- [x] **N1. Per-game Screenshot button next to Export/Import**, opening a
  window listing that game's screenshots, saved to a local subfolder under
  Documents. Bound to the M2 keybind.

  Captures the focused game's own OS window via `desktopCapturer`, falling
  back to the full screen (never silently) if no window-title match is
  found. Gallery served through a new `gt-asset://screenshots/<profile>/
  <file>` route on the existing protocol handler.

## O. Overlay (found 2026-08-13) — DONE 2026-08-14

- [x] **O1. In-game overlay** showing session time and a recording-state dot
  (green = tracking, red = not). Position on screen and what it shows are both
  configurable from a new Overlay settings section.

  Best-effort only, by design — a transparent, click-through, always-on-top
  `BrowserWindow` (same hash-routed-second-window trick `drawingPopout.ts`
  uses), which cannot and does not appear over true fullscreen-exclusive
  games. No DLL injection: the user explicitly asked about it and agreed it
  wasn't worth the anti-cheat risk once the trade-off was laid out.

  **Real bug found and fixed same day, on a live test with Forager** (a
  real windowed GOG game): the overlay correctly detected the focused game
  and correctly showed itself, but positioned itself relative to the
  *display's* corner instead of the *game window's* corner — invisible on
  a large desktop with a small windowed game nowhere near the screen edge.
  Also needed `screen.screenToDipRect()`: the foreground probe reports
  physical pixels, every Electron window API speaks DIP, and the two only
  diverge on a scaled display (this bit at 150%, would pass silently at
  100%). Also bumped `alwaysOnTop` from the default `'floating'` level to
  `'screen-saver'` — floating can lose to a game's own topmost window.
  Fixed and covered by two new E2E checks (game-anchored position,
  computed through the app's own `screenToDipRect` so the test itself
  stays correct on any display scaling — not hardcoded to 100%).

## P. Naming (found 2026-08-13)

- [ ] **P1. Deep-search trademark/uniqueness on the name "Gamut"** before any
  more branding investment — the color-word approach felt like a mismatch for
  a game-time launcher anyway. Rename candidate: "Gameplats" (pending the
  search).

## Y. Low priority — needs live repro, do last before Linux

- [ ] **Y1 (was B1). Vindictus/Nexon won't actually launch.**
- [ ] **Y2 (was B3). Heroes of the Storm/Battle.net won't actually launch.**

## Z. Last

- [ ] **Z1. Linux build.** Only once every box above is ticked.
