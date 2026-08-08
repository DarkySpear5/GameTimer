# Gamut v3 Stage 2 — Identity & Art Implementation Plan

> Compact plan: file structure, task boundaries and interfaces. Executed inline
> in the authoring session, so it deliberately does not restate every line of
> code the way the stage 1 plan does.

**Goal:** Add a game by clicking its window instead of typing its name, and get its cover and background automatically — with no account, no API key, and no server.

**Architecture:** Detection is read-only and lives entirely in main. Three small modules with one responsibility each — enumerate running apps, read the Steam library, fetch art — composed by a fourth that resolves identity. The renderer only ever sees a finished `RunningApp[]` or a finished `Identity`.

**Tech Stack:** Electron 37 (`app.getFileIcon`, `net.fetch`), PowerShell + `reg.exe` via `execFile` (no native modules), zod 4, React 19, Vitest.

## Global Constraints

- **Branch `dev`.** Nothing merges to `main` until stage 3 is done.
- **No account, no API key, no hosted service.** Verified keyless endpoints only.
- **No new runtime dependencies.** Process enumeration and registry reads go through `execFile` on tools Windows already ships.
- **Detection never writes.** It reads process lists, `.acf` files and the registry. It must not launch, kill, or modify anything.
- **Network is optional and best-effort.** Every art call is behind a try/catch; a failed fetch leaves the game with no art, never an error dialog. The app must work fully offline.
- **Path A resolves silently; Path B must be confirmed.** Steam-installed games get an exact appid from `appmanifest`. Name search can return the wrong game confidently (`MarvelRivals` → *Marvel Rivals Playtest*), so its result is shown before it is applied.
- All user-facing strings in all 10 locales.
- `npm test && npm run typecheck && npm run build` clean before every commit.

## Verified facts this depends on

Measured 2026-08-07, do not re-litigate:

- `app.getFileIcon(exePath, { size: 'large' })` returns a non-empty 32–48px icon for real game exes, ~80ms each.
- `Get-Process | Where MainWindowTitle -ne ''` returns ~7 rows on a normal desktop, all with a resolvable `Path`.
- `steamcommunity.com/actions/SearchApps/<name>` is keyless and fuzzy.
- `cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900.jpg` and `library_hero.jpg` are keyless.
- `.exe` `ProductName` is unreliable (right 5/13, wrong 4/13) — folder name is the signal.

## File structure

| File | Responsibility |
|---|---|
| `src/main/detect/processList.ts` | Enumerate running windowed apps + icons. Knows nothing about games. |
| `src/main/detect/steamLibrary.ts` | Locate Steam, parse `libraryfolders.vdf` and `appmanifest_*.acf`. Knows nothing about processes. |
| `src/main/art/steamArt.ts` | Name→appid search and art download. Knows nothing about profiles. |
| `src/main/detect/identify.ts` | Composes the three above into the two-path resolution. |
| `src/main/ipc/detect.ipc.ts` | IPC surface for the above. |
| `src/renderer/src/components/dialogs/AddGameDialog.tsx` | The two-button entry point and the picker grid. |

## Tasks

### Task 1 — Profile/settings fields
`exePath`, `steamAppId`, `autoFetchArt` (tri-state `boolean | null`) on `Profile`; `autoFetchArt: boolean` (default true) on `Settings`. zod `.catch()` defaults for all. Extend `.gtprofile` to carry `sessionLog` **and** the new fields, so exporting from the dev build and importing into a public release keeps session history instead of silently resetting it to zero.

### Task 2 — `processList.ts`
`listRunningApps(): Promise<RunningApp[]>` where `RunningApp = { pid, processName, title, exePath, iconDataUrl, likelyGame }`.
PowerShell one-shot returning JSON; drop rows with no `Path`; drop a denylist of launchers/OS shells/Gamut itself; `likelyGame` true when the path sits under a known game-library root. Icons via `app.getFileIcon`, failures degrade to `null` rather than dropping the row.
Pure ranking/filtering logic split into `filterAndRank()` and unit-tested.

### Task 3 — `steamLibrary.ts`
`scanSteamLibrary(): Promise<SteamGame[]>` and `findByExePath(exePath)`.
Steam root from `reg query HKCU\Software\Valve\Steam /v SteamPath`, falling back to the two default install paths. Parse `libraryfolders.vdf` for library roots, then each `steamapps/appmanifest_*.acf` for `appid`/`name`/`installdir`. Match an exe path by locating `steamapps\common\<dir>` in it, case-insensitively.
The `.acf` and `.vdf` parsing is pure and unit-tested against real fixture text.

### Task 4 — `steamArt.ts`
`searchSteamApps(query)` → `{ appId, name }[]` via the keyless SearchApps endpoint. `fetchArt(appId)` → downloads `library_600x900.jpg` and `library_hero.jpg` through Electron `net.fetch` and stores them with the existing `saveCappedImageBuffer` so they get the same size caps as manually chosen art. Everything try/caught; offline is a normal outcome, not an error.

### Task 5 — `identify.ts` + IPC
`identify(exePath, windowTitle)` → `{ name, steamAppId, confident }`. Path A (appmanifest) sets `confident: true`; Path B (folder name → search) sets `confident: false`. Candidate-name derivation (folder name, then window title, then exe basename, cleaned of `.exe`/version noise) is pure and unit-tested. IPC: `detect:listRunning`, `detect:identify`, `detect:searchGames`, `detect:applyArt`.

### Task 6 — Add Game dialog
Replaces the inline name box with a modal offering **Detect running game** and **Add manually**. Picker shows a grid of tiles (icon, title, process name), likely games first. Selecting one identifies it; `confident` games are created immediately with art, non-confident ones show the matched cover for a one-click confirm with a search box to correct it.

### Task 7 — Settings + Modify
Global "Auto-fetch cover art" in Settings' General tab. Per-game override in Modify's Appearance tab as a three-state control (Follow global / Always / Never). Modify's tabs get regrouped as part of this.

### Task 8 — Locales + end-to-end verification
All new strings in 10 languages. `scripts/verify-stage2.cjs` drives the real app: picker lists processes, a Steam path resolves to the right appid, art lands on disk, a non-confident match asks before applying. Network-touching assertions run against fixtures, not live Steam.

## Not in this stage

Launch button, launch counting, `openSeconds`, idle time, background detection, auto-start — all stage 3.
