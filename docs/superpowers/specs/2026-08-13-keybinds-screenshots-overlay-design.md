# Keybinds, Screenshots, Overlay — design

Punch-list sections M, N, O (`docs/superpowers/plans/2026-08-08-gamut-v3-punchlist.md`),
worked as one connected chunk: N's screenshot hotkey needs M's keybind system, and O's
overlay shows the same running/focused state M's hotkey acts on.

## Goal

- **M.** A Settings tab where the user can rebind two global (system-wide) hotkeys:
  start/pause the timer, and save a screenshot.
- **N.** A per-game screenshot gallery, populated by that hotkey, saved locally.
- **O.** A small always-on-top overlay (session time + a running/not dot) shown over
  the game while it's being played, configurable from a new Overlay settings section.

## Core concept: "the current game"

All three features need to answer the same question at the moment they act: *which
tracked game, if any, does this apply to right now?* Confirmed definition: the game
must be both (a) linked to a real exe/install folder Gamut recognizes (the same
"linked" set the background watcher itself filters to — `profile.exePath ||
profile.installDir`), and (b) the OS-focused window at that instant.

(b) alone actually proves the process side of (a) is running — a window can't be OS-
focused unless its owning process is alive — so this needs no dependency on the
opt-in, off-by-default `gameWatcher` poll, and no dependency on the *timer* already
being on either. That last point matters: gating on `timerEngine.isRunning()` was an
earlier draft of this rule, and it was wrong — it would have meant the start/pause
hotkey could only ever ​pause​ (the gate requires "already running" before anything
acts), never start a timer that isn't running yet, which defeats half the hotkey's
purpose. The timer's own state is instead read separately by whichever feature needs
it: M's hotkey toggles it (start if off, pause if on), O's dot reflects it
(green/red), and N's capture doesn't care about it at all.

This is deliberately stricter than "whichever game is running": with two tracked
games open at once, only the one you're actually tabbed into is "current."

## Shared infrastructure: `getForegroundGameWindow()`

New module, `src/main/detect/foregroundWindow.ts`, mirroring the existing
`src/main/detect/processes.ts` pattern (shell out to `powershell.exe` via `execFile`,
`windowsHide: true`, JSON output) rather than adding a native npm dependency.

One PowerShell invocation, using `Add-Type` to declare a small `user32.dll` P/Invoke
surface (`GetForegroundWindow`, `GetWindowThreadProcessId`, `GetWindowText`,
`GetWindowRect`), then resolving the PID to its exe path via `Get-Process -Id`.
Returns `{ pid, exePath, title, bounds: { x, y, width, height } } | null` as one JSON
object — everything M/N/O need from a single call: profile matching (exePath),
screenshot window-source matching (title), and overlay positioning (bounds).

Matching an `exePath` to a tracked profile reuses the existing `matchingPaths()` /
`isGameRunning()` logic from `src/main/detect/watchMatch.ts` — same install-folder-or-
exact-exe rule the background watcher already uses, not a second implementation.

**Why shell out instead of a native addon or `get-windows`:** this codebase already
hit real packaging fragility from a native/ESM dependency once (`@noble/hashes`
crashing electron-builder's blockmap step, documented in the v2 memory). A `ffi-napi`
addon or the `get-windows` npm package would be faster in-process, but both add
prebuilt-binary risk across Electron/Node upgrades, and `get-windows` is ESM-only
against this app's CJS-bundled main process. The cost of shelling out (~300–500ms per
call, PowerShell startup + `Add-Type` compile) is irrelevant for a one-off hotkey
press and acceptable for the overlay's ~2s poll — see the Overlay section.

## M — Keybinds

**Data:** `Settings.keybinds: { startPauseTimer: string, saveScreenshot: string }` in
`src/shared/types.ts` and `SettingsSchema` in `src/main/store/schema.ts`, alongside
the existing settings fields. Stored as a display string in the same shape the punch
list's examples use (`"Ctrl+2"`, `"Alt+F1"`, `"Ctrl+Tab+Home"`).

Proposed defaults, applied when a user has never set one: Start/Pause Timer =
`Ctrl+F9`, Save Screenshot = `Ctrl+F10`. Both satisfy the M2 combo rule below and are
unlikely to collide with common app shortcuts.

**Validation** (`src/shared/validateCombo.ts`, framework-free and unit-tested, same
split as `watchMatch.ts`): a combo is a sequence of 2 or 3 key tokens.
- 2 tokens: first must be one of `Shift` / `Ctrl` / `Alt` / `Tab`, second is any key.
- 3 tokens: first two must be exactly `Ctrl`, `Tab` (in that order), third is any key.
- Anything else (a bare single key, wrong first token, 4+ tokens) is rejected.

**UI:** new `KeybindsSettings.tsx` (own file, following `LauncherSettings.tsx`'s
pattern for a tab complex enough to warrant one), added to `SettingsDialog.tsx`'s
`Tab` union and `TABS` array, positioned after Games. Each row is a "click to record"
control: focus it, press the combo, keyup finalizes and validates it, an invalid
combo shows an inline error and doesn't save.

**Main process:** `src/main/keybinds/keybindService.ts`, registered at startup and
re-registered whenever `Settings.keybinds` changes (unregister old combo, register
new). `globalShortcut.register()` returns `false` on failure (already in use by
another app) rather than throwing — that failure is surfaced back to the Keybinds tab
as an inline error, not swallowed, matching the project's established "no silent
no-ops" rule from the L3 notes-rewrite bug hunts.

**Handler logic**, both hotkeys: call `getForegroundGameWindow()`, match it against
every *linked* profile (see "the current game" above — not gated on the timer already
running). No match → no-op. Start/Pause toggles based on the timer's current state
(`timerEngine.isRunning`) exactly like the existing `IPC.timer.start`/`pause` handlers
do (including the `trayService.refresh()` call after). Save Screenshot delegates to
the N capture routine, independent of whether the timer happens to be running.

## N — Screenshots

**Storage:** `Documents/Gamut/Screenshots/<ProfileName>/<timestamp>.png`, created on
first use. No new `Profile` schema field — the path is derived from the profile name,
consistent with how notes/other per-game data is already keyed.

**Capture** (`src/main/screenshots/captureScreenshot.ts`): given the
`getForegroundGameWindow()` result already resolved by the keybind handler, find the
matching `desktopCapturer.getSources({ types: ['window'] })` entry by exact title
match, and write its thumbnail/stream to disk. If no title match is found (some
borderless/multi-window games don't expose a clean 1:1 title), fall back to capturing
the full monitor containing the window's `bounds` instead of failing silently, and
surface that fallback happened (a toast/notification, not just a log line) — same
"never silently no-op" reasoning as the keybind registration failure above.

**UI:** new action-bar entry "Screenshot" in `LibraryDetail.tsx`, in the same array as
Export/Import/J5's Open .exe directory, positioned between Export and Import per the
punch list. Opens a modal gallery dialog (own component, following the Notes dialog's
pattern of a same-window modal — this doesn't need the drawing pop-out's separate-
window/drag-to-reattach machinery). Grid of thumbnails read from the profile's
screenshot folder; clicking one opens it via `shell.openPath` in the OS's default
viewer, the same integration style J5 already uses for "Open .exe directory."

## O — Overlay

**Settings:** new `Settings.overlay` object — `{ enabled: boolean, corner:
'top-left'|'top-right'|'top-center'|'bottom-left'|'bottom-right'|'bottom-center',
scale: number, shadow: boolean }` — plus a new `OverlaySettings.tsx` tab (own file,
same pattern as `LauncherSettings.tsx`/`KeybindsSettings.tsx`), added to the `Tab`
union and `TABS` array immediately after Keybinds. Scale slider range 0.5x–2.0x,
mirroring the existing Font Size slider's UX (G4). Master `enabled` toggle defaults
to off.

**Window:** `src/main/overlay/overlayWindow.ts`, a dedicated `BrowserWindow` —
`transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable:
false, hasShadow: false, fullscreenable: false` (same lockout precedent as the L3
drawing pop-out) — with `setIgnoreMouseEvents(true, { forward: true })` for
click-through. Loads the existing renderer bundle at a new hash route (`#overlay`),
the same technique the drawing pop-out uses for `#drawing-popout` — real
preload/IPC surface for free, no build-config changes.

**Content:** session time and a colored dot (green = timer running, red = not), both
scaled by the `scale` setting, with the `shadow` setting toggling a CSS `text-shadow`
for readability against arbitrary game backgrounds. Pushed from main to the overlay
window via a dedicated one-way IPC broadcast rather than the renderer subscribing to
`timer.onTick` itself — main's poll loop already has to resolve *which* profile is
current (see below), so it computes the displayed seconds/running state once and
sends exactly that, instead of the overlay renderer re-deriving the same answer.

**Visibility/positioning:** polls `getForegroundGameWindow()` roughly every 2s while
`overlay.enabled` is true and matches it against every linked profile — the same
"current game" rule as M, independent of the timer's own state. Visible and positioned in the
configured corner of the display containing the focused window's `bounds` only when
the focused window belongs to a running, tracked profile; hidden otherwise (including
whenever Gamut's own window has focus, which falls out of this rule for free — Gamut
is never itself "the current game").

**Documented limitation:** true fullscreen-exclusive games render directly to the
GPU and cannot be overlaid by an ordinary window — confirmed acceptable. Borderless
and windowed games, the common case, are supported. No DLL injection (Discord/Steam's
approach): that requires native per-graphics-API hooking outside this app's stack,
and injecting into a process is the same signature anti-cheat systems (this app
already deals with EasyAntiCheat, per punch-list B4) flag as cheat-like — a real risk
to the user's game account, not just extra engineering effort.

## Testing / verification

Per the project's established rule (see memory: a browser approximation of the
renderer bundle is not sufficient for Electron main-process behavior), all three
features get verified against the real packaged app via Playwright
(`_electron.launch`), not a browser tab:
- M: register a combo, simulate the OS-level keypress (or call the handler directly
  if OS-level key injection isn't reliably scriptable), confirm the correct profile's
  timer starts/pauses only when that profile is both running and focused.
- N: trigger capture, confirm a file lands in the right per-profile folder; confirm
  the fallback path when window-source matching fails.
- O: confirm the overlay window shows/hides/repositions correctly across
  focus-change and corner/scale/shadow setting changes; confirm it's absent when
  a tracked game isn't focused (including when Gamut itself has focus).

`validateCombo` and the `getForegroundGameWindow()`-to-profile matching logic (reused
from `watchMatch.ts`) get unit tests, same split as the existing `watchMatch.test.ts`.

## Explicitly out of scope

- Fullscreen-exclusive game support for the overlay.
- Any form of process injection or graphics-API hooking.
- A configurable screenshot save location (fixed under Documents for now).
- Editing/deleting screenshots from within the gallery (view-only for this pass).
