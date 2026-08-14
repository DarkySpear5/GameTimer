# Keybinds, Screenshots, Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship punch-list sections M (rebindable global hotkeys for start/pause-timer and save-screenshot), N (a per-game screenshot gallery populated by that hotkey), and O (a small always-on-top in-game overlay showing session time + a tracking dot), as one connected chunk.

**Architecture:** One new main-process module (`foregroundWindow.ts`) answers "which tracked, linked game is the OS-focused window right now" for all three features via a single PowerShell shell-out (same `execFile` pattern `processes.ts` already uses — no native/ESM dependency). M registers two `globalShortcut` accelerators that call into this; N reuses the same resolved window to capture via `desktopCapturer`; O polls it on a slow interval to show/hide/position a second, click-through `BrowserWindow` (same hash-routed-second-window trick `drawingPopout.ts` already uses for its own secondary window), pushing live time over IPC via the existing tick loop.

**Tech Stack:** Electron 37 main process (TypeScript, CommonJS bundle via electron-vite), React 19 renderer, zod 4 for settings validation, zustand 5 for renderer state, vitest 2 for unit tests, playwright-core for real-app E2E verification.

## Global Constraints

- Windows-only app (per project memory) — PowerShell (`powershell.exe` via `child_process.execFile`) is an acceptable dependency; do not add a native addon or an ESM-only npm package for OS queries. This project already hit real packaging fragility from one native/ESM dependency (`@noble/hashes` breaking electron-builder's blockmap step) and the design spec explicitly rules out repeating that.
- No DLL injection or graphics-API hooking of any kind (see the design spec's rationale — anti-cheat risk to the user's game accounts). The overlay is a best-effort always-on-top window; it will not appear over true fullscreen-exclusive games, and that is accepted, not a bug to fix later.
- Zod schema fields always use `.catch(default)`, never bare validation — see `schema.ts`'s existing convention and comment. A field that's missing or the wrong type falls back to its default; it never fails the whole load.
- New locale strings go in `src/renderer/src/locales/en/common.json` only (English). This app ships 10 languages via i18next with English as `fallbackLng`, so missing translations in the other 9 render in English automatically — translating this feature is out of scope for this plan. The file is alphabetically sorted by key; insert new keys in alphabetical position.
- Any new `BrowserWindow` for a small utility window (the overlay) must set `fullscreenable: false` — see `drawingPopout.ts`'s comment on why (a small utility window has no business going OS-fullscreen, and no obvious way back out if it does).
- All verification against the real packaged app must isolate save data via the `GAMUT_TEST_APPDATA` bundle patch (see `feedback-isolate-gamut-test-launches` in project memory) — never run a Playwright check against the real `%APPDATA%\gametimer\` folder.
- Main-process code has no i18n instance (i18next only exists in the renderer). Any user-facing text that originates in main (e.g. a toast triggered by a global hotkey with no renderer call site to react to) must cross IPC as a semantic code + params, translated renderer-side — never a hardcoded English string sent from main.
- Follow the existing IPC pattern exactly: channel name constants live in `src/shared/ipcContract.ts`'s `IPC` object, the full renderer-facing shape is `GameTimerApi` in the same file, `src/preload/index.ts` is a thin pass-through with no logic, and every `ipcMain.handle`/`.on` registration happens inside a per-domain `register*Ipc()` function called from `src/main/ipc/registerAll.ts`.
- Every task must leave `npm run typecheck` passing (`tsc --noEmit` against both `tsconfig.node.json` and `tsconfig.web.json`) before it is committed.

---

### Task 1: Foreground-window detection & current-game matching

**Files:**
- Create: `src/main/detect/foregroundMatch.ts`
- Create: `src/main/detect/foregroundMatch.test.ts`
- Create: `src/main/detect/foregroundWindow.ts`

**Interfaces:**
- Consumes: `isGameRunning` from `src/main/detect/watchMatch.ts` (existing — `isGameRunning(game: { installDir: string | null; exePath: string | null }, running: Set<string>): boolean`); `dataStore` from `src/main/store/dataStore.ts` (existing — `dataStore.get(): AppData`, where `AppData.profiles: Record<string, Profile>`).
- Produces: `ForegroundWindowInfo { exePath: string; title: string; bounds: { x: number; y: number; width: number; height: number } }`, `parseForegroundWindowJson(raw: string): ForegroundWindowInfo | null`, `matchForegroundToRunning(exePath: string, candidates: Array<{ name: string; installDir: string | null; exePath: string | null }>): string | null` — all from `foregroundMatch.ts`. `getForegroundGameWindow(): Promise<ForegroundWindowInfo | null>` and `resolveCurrentGame(fg?: ForegroundWindowInfo | null): Promise<string | null>` from `foregroundWindow.ts` — these are what every later task (M's hotkey handler, N's capture, O's poll loop) calls.

This is the one piece of shared infrastructure M, N, and O all sit on top of: "which tracked game, if any, is the OS-focused window right now." Kept as two files on purpose, mirroring the existing `watchMatch.ts` (pure, tested) / `gameWatcher.ts` (impure, untested — reads live process state) split: `foregroundMatch.ts` has zero `electron`/`child_process` imports so its matching rule can be unit-tested without shelling out to PowerShell; `foregroundWindow.ts` does the actual OS query.

- [ ] **Step 1: Write the failing test for the pure matching module**

Create `src/main/detect/foregroundMatch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { matchForegroundToRunning, parseForegroundWindowJson } from './foregroundMatch'

describe('parseForegroundWindowJson', () => {
  it('parses a well-formed result', () => {
    const raw = JSON.stringify({
      ExePath: 'C:\\Games\\Doom\\doom.exe',
      Title: 'DOOM Eternal',
      X: 0,
      Y: 0,
      Width: 1920,
      Height: 1080
    })
    expect(parseForegroundWindowJson(raw)).toEqual({
      exePath: 'C:\\Games\\Doom\\doom.exe',
      title: 'DOOM Eternal',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 }
    })
  })

  it('returns null for empty output', () => {
    expect(parseForegroundWindowJson('')).toBeNull()
    expect(parseForegroundWindowJson('   ')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseForegroundWindowJson('not json')).toBeNull()
  })

  it('returns null when ExePath is missing (no process could be resolved)', () => {
    expect(
      parseForegroundWindowJson(JSON.stringify({ Title: 'x', X: 0, Y: 0, Width: 1, Height: 1 }))
    ).toBeNull()
  })

  it('returns null when a numeric field is the wrong type', () => {
    expect(
      parseForegroundWindowJson(
        JSON.stringify({ ExePath: 'a.exe', Title: 'x', X: '0', Y: 0, Width: 1, Height: 1 })
      )
    ).toBeNull()
  })
})

describe('matchForegroundToRunning', () => {
  const candidates = [
    { name: 'Doom Eternal', installDir: 'C:\\Games\\Doom', exePath: null },
    { name: 'Portal 2', installDir: 'C:\\Games\\Portal 2', exePath: null }
  ]

  it('matches the candidate whose install folder contains the focused exe', () => {
    expect(matchForegroundToRunning('C:\\Games\\Doom\\doom.exe', candidates)).toBe('Doom Eternal')
  })

  it('returns null when the focused exe belongs to no candidate', () => {
    expect(matchForegroundToRunning('C:\\Windows\\explorer.exe', candidates)).toBeNull()
  })

  it('is case-insensitive, same as the underlying watcher rule', () => {
    expect(matchForegroundToRunning('c:\\games\\doom\\DOOM.EXE', candidates)).toBe('Doom Eternal')
  })

  it('returns null against an empty candidate list', () => {
    expect(matchForegroundToRunning('C:\\Games\\Doom\\doom.exe', [])).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- foregroundMatch`
Expected: FAIL — `Cannot find module './foregroundMatch'` (the module doesn't exist yet).

- [ ] **Step 3: Write the pure matching module**

Create `src/main/detect/foregroundMatch.ts`:

```ts
import { isGameRunning } from './watchMatch'

/**
 * Deciding which tracked, linked game (if any) the OS-focused window belongs
 * to. Kept free of `electron`/`child_process`, same split as watchMatch.ts,
 * so the matching rule itself can be unit-tested without shelling out to
 * PowerShell — see foregroundWindow.ts for the actual OS query.
 */

/** Screen pixels, straight from PowerShell's GetWindowRect — not DPI-scaled. */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ForegroundWindowInfo {
  exePath: string
  title: string
  bounds: WindowBounds
}

/** Only the fields the matching rule needs, so tests don't build a whole Profile. */
export interface RunningCandidate {
  name: string
  installDir: string | null
  exePath: string | null
}

/**
 * Parses the JSON object foregroundWindow.ts's PowerShell script prints.
 * Returns null for anything that isn't a well-formed result — a missing or
 * empty ExePath (no Get-Process resolved, or access denied) is treated the
 * same as "nothing is focused" rather than a partial result, since a
 * foreground window this can't attribute to an exe can never match a profile.
 */
export function parseForegroundWindowJson(raw: string): ForegroundWindowInfo | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  const { ExePath: exePath, Title: title, X: x, Y: y, Width: width, Height: height } = obj
  if (
    typeof exePath !== 'string' ||
    exePath.length === 0 ||
    typeof title !== 'string' ||
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null
  }
  return { exePath, title, bounds: { x, y, width, height } }
}

/**
 * Same install-folder-or-exact-exe rule as watchMatch.ts's isGameRunning,
 * reused rather than reimplemented — "is this game running" (the background
 * watcher) and "is this game focused" (this) can never quietly disagree on
 * what counts as a match.
 */
export function matchForegroundToRunning(exePath: string, candidates: RunningCandidate[]): string | null {
  const focused = new Set([exePath.toLowerCase()])
  for (const candidate of candidates) {
    if (isGameRunning({ installDir: candidate.installDir, exePath: candidate.exePath }, focused)) {
      return candidate.name
    }
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- foregroundMatch`
Expected: PASS — all 9 cases green.

- [ ] **Step 5: Write the impure OS-query module**

Create `src/main/detect/foregroundWindow.ts`:

```ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import { dataStore } from '../store/dataStore'
import { matchForegroundToRunning, parseForegroundWindowJson } from './foregroundMatch'
import type { ForegroundWindowInfo } from './foregroundMatch'

export type { ForegroundWindowInfo } from './foregroundMatch'

const execFileAsync = promisify(execFile)

/**
 * One self-contained script: gets the OS foreground window's HWND, resolves
 * it to the owning process's exe path (for profile matching), its window
 * title (for screenshot window-source matching), and its screen bounds (for
 * overlay positioning) — everything M/N/O need from a single PowerShell
 * invocation, same execFile/Add-Type shape as processes.ts.
 */
const SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class GamutWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$hwnd = [GamutWin32]::GetForegroundWindow()
$procId = 0
[GamutWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
$sb = New-Object System.Text.StringBuilder 256
[GamutWin32]::GetWindowText($hwnd, $sb, 256) | Out-Null
$rect = New-Object GamutWin32+RECT
[GamutWin32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
if (-not $proc -or -not $proc.Path) { exit }
[PSCustomObject]@{
  ExePath = $proc.Path
  Title = $sb.ToString()
  X = $rect.Left
  Y = $rect.Top
  Width = $rect.Right - $rect.Left
  Height = $rect.Bottom - $rect.Top
} | ConvertTo-Json -Compress
`

/**
 * The OS-focused window's owning exe, title, and bounds, or null if nothing
 * could be resolved. Shells out to PowerShell rather than a native addon —
 * see this plan's Global Constraints for why.
 *
 * GAMUT_TEST_FOREGROUND lets a Playwright verify script fake this result
 * deterministically instead of depending on whatever real window happens to
 * have OS focus during a test run — set it to a JSON string in the shape the
 * PowerShell script prints, or to '' to simulate nothing focused. Unlike
 * GAMUT_TEST_APPDATA (which has to patch a literal Electron API call in the
 * built bundle), this is our own function reading its own env var — safe to
 * leave in permanently, since a real user never sets this variable.
 */
export async function getForegroundGameWindow(): Promise<ForegroundWindowInfo | null> {
  const override = process.env.GAMUT_TEST_FOREGROUND
  if (override !== undefined) {
    return override === '' ? null : parseForegroundWindowJson(override)
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 5_000 }
    )
    return parseForegroundWindowJson(stdout)
  } catch {
    return null
  }
}

/**
 * The "current game" M/N/O all act on: whichever tracked, linked profile
 * (`exePath || installDir` set — same filter gameWatcher.ts's own poll
 * uses) is the OS-focused window right now. Being focused already proves its
 * process is running, so this needs no dependency on the opt-in
 * `gameWatcher` poll or the Gamut timer's own state — see this plan's design
 * spec for why an earlier draft gating on `timerEngine.isRunning()` was
 * wrong (it would make a start/pause hotkey only ever able to pause).
 *
 * Pass an already-resolved `fg` when the caller also needs its title/bounds
 * (screenshot capture, overlay positioning) so this never shells out to
 * PowerShell twice for one hotkey press or poll tick.
 */
export async function resolveCurrentGame(fg?: ForegroundWindowInfo | null): Promise<string | null> {
  const info = fg !== undefined ? fg : await getForegroundGameWindow()
  if (!info) return null
  const data = dataStore.get()
  const candidates = Object.values(data.profiles)
    .filter((p) => p.exePath || p.installDir)
    .map((p) => ({ name: p.name, installDir: p.installDir, exePath: p.exePath }))
  return matchForegroundToRunning(info.exePath, candidates)
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/main/detect/foregroundMatch.ts src/main/detect/foregroundMatch.test.ts src/main/detect/foregroundWindow.ts
git commit -m "M/N/O: add foreground-window detection and current-game matching"
```

---

### Task 2: Keybind combo validation

**Files:**
- Create: `src/shared/validateCombo.ts`
- Create: `src/shared/validateCombo.test.ts`

**Interfaces:**
- Produces: `validateCombo(combo: string): boolean`, used by Task 4 (main-process authoritative check before registering a global shortcut) and Task 5 (renderer inline validation feedback — actually the renderer never calls this directly, see Task 5's note; it reads the `invalid_combo` result from `keybinds.set`).

Enforces the M2 combo rule: 2-key combos need a modifier first (`Shift`/`Ctrl`/`Alt`/`Tab`); a 3-key combo must start `Ctrl+Tab+…`. Framework-free (no React, no Electron) so both processes can share it without either pulling in the other's dependencies.

- [ ] **Step 1: Write the failing test**

Create `src/shared/validateCombo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateCombo } from './validateCombo'

describe('validateCombo', () => {
  it('accepts the punch list examples', () => {
    expect(validateCombo('Ctrl+2')).toBe(true)
    expect(validateCombo('Alt+F1')).toBe(true)
    expect(validateCombo('Alt+Home')).toBe(true)
    expect(validateCombo('Ctrl+Tab+Home')).toBe(true)
  })

  it('rejects a bare single key', () => {
    expect(validateCombo('F9')).toBe(false)
  })

  it('rejects a 2-key combo whose first key is not a modifier', () => {
    expect(validateCombo('2+Ctrl')).toBe(false)
    expect(validateCombo('A+B')).toBe(false)
  })

  it('rejects a 3-key combo that does not start Ctrl+Tab', () => {
    expect(validateCombo('Alt+Tab+Home')).toBe(false)
    expect(validateCombo('Ctrl+Shift+Home')).toBe(false)
  })

  it('rejects a combo longer than 3 keys', () => {
    expect(validateCombo('Ctrl+Tab+Shift+Home')).toBe(false)
  })

  it('rejects repeated keys', () => {
    expect(validateCombo('Ctrl+Ctrl')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(validateCombo('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- validateCombo`
Expected: FAIL — `Cannot find module './validateCombo'`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/validateCombo.ts`:

```ts
/**
 * Combo validation for punch-list M2: 2 keys need a modifier first
 * (Shift/Ctrl/Alt/Tab); a 3-key combo must start Ctrl+Tab+<anything>.
 * Framework-free so it's shared between the renderer (KeybindsSettings'
 * capture control builds a combo string the same shape this expects) and
 * main (the authoritative check keybinds.ipc.ts runs before actually
 * registering a global shortcut).
 */
const REQUIRED_FIRST_KEYS = ['Shift', 'Ctrl', 'Alt', 'Tab']

export function validateCombo(combo: string): boolean {
  const tokens = combo.split('+').filter((t) => t.length > 0)
  const unique = new Set(tokens)
  if (unique.size !== tokens.length) return false

  if (tokens.length === 2) return REQUIRED_FIRST_KEYS.includes(tokens[0])
  if (tokens.length === 3) return tokens[0] === 'Ctrl' && tokens[1] === 'Tab'
  return false
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- validateCombo`
Expected: PASS — all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/validateCombo.ts src/shared/validateCombo.test.ts
git commit -m "M: add keybind combo validation"
```

---

### Task 3: Screenshot capture module

**Files:**
- Modify: `src/main/store/paths.ts`
- Create: `src/main/screenshots/captureScreenshot.ts`

**Interfaces:**
- Consumes: `ForegroundWindowInfo` from Task 1 (`src/main/detect/foregroundMatch.ts`).
- Produces: `paths.screenshotsDir(profileName: string): string`; `captureScreenshot(profileName: string, fg: ForegroundWindowInfo): Promise<{ filePath: string; fallback: boolean }>`; `listScreenshots(profileName: string): Promise<string[]>` (newest-first absolute paths) — consumed by Task 4 (keybindService's saveScreenshot handler) and Task 6 (the `screenshots:list`/`screenshots:open` IPC handlers).

No test file: this module's only logic is Electron I/O (`desktopCapturer`, filesystem), matching the codebase's existing convention that main-process I/O modules like `processes.ts` and `drawingPopout.ts` aren't unit-tested — covered instead by Task 11's real-app verification.

- [ ] **Step 1: Add the screenshots path helper**

Modify `src/main/store/paths.ts` — add `screenshotsDir` to the exported `paths` object, after `firstRunFile`:

```ts
  firstRunFile: () => join(root(), 'firstrun.json'),
  /**
   * Rooted at Documents, not userData — screenshots are meant to be found by
   * the user in Explorer, unlike everything else in `paths`. GAMUT_TEST_DOCUMENTS
   * lets a Playwright verify script isolate this the same way GAMUT_TEST_APPDATA
   * isolates userData (see feedback-isolate-gamut-test-launches) — without it, a
   * verify run would write real files into the user's real Documents folder.
   */
  screenshotsDir: (profileName: string) =>
    join(process.env.GAMUT_TEST_DOCUMENTS || app.getPath('documents'), 'Gamut', 'Screenshots', profileName)
```

- [ ] **Step 2: Write the capture module**

Create `src/main/screenshots/captureScreenshot.ts`:

```ts
import { desktopCapturer } from 'electron'
import { mkdir, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { paths } from '../store/paths'
import type { ForegroundWindowInfo } from '../detect/foregroundMatch'

export interface CaptureResult {
  filePath: string
  fallback: boolean
}

/**
 * Captures the focused game's own OS window when a desktopCapturer source's
 * title matches it exactly. Falls back to the first available screen source
 * (typically the primary display) when no title match is found — some
 * borderless/multi-window games don't expose a clean 1:1 window title. Never
 * fails silently: the caller (keybindService) surfaces which happened to the
 * user via a toast, rather than the fallback going unnoticed.
 */
export async function captureScreenshot(profileName: string, fg: ForegroundWindowInfo): Promise<CaptureResult> {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 3840, height: 2160 }
  })
  const windowSource = sources.find((s) => s.name === fg.title)
  // Doesn't try to pin down exactly which monitor the window is on when
  // falling back — desktopCapturer's screen sources don't reliably
  // cross-reference Electron's own display objects across platforms, and
  // this path is already the rare "couldn't isolate the window" case, not
  // the common one.
  const source = windowSource ?? sources.find((s) => s.id.startsWith('screen:'))
  if (!source) throw new Error('No capturable source found')

  const dir = paths.screenshotsDir(profileName)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, `${Date.now()}.png`)
  await writeFile(filePath, source.thumbnail.toPNG())
  return { filePath, fallback: !windowSource }
}

/** Newest first — filenames are Date.now() timestamps, so lexicographic order is chronological order. */
export async function listScreenshots(profileName: string): Promise<string[]> {
  try {
    const dir = paths.screenshotsDir(profileName)
    const files = await readdir(dir)
    return files
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort()
      .reverse()
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/store/paths.ts src/main/screenshots/captureScreenshot.ts
git commit -m "N: add screenshot capture and listing"
```

---

### Task 4: Keybind service, toast broadcast, and its IPC

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/store/schema.ts`
- Modify: `src/shared/ipcContract.ts`
- Modify: `src/preload/index.ts`
- Create: `src/main/keybinds/keybindService.ts`
- Create: `src/main/ipc/keybinds.ipc.ts`
- Create: `src/main/ipc/dev.ipc.ts`
- Modify: `src/main/ipc/registerAll.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/state/toastBroadcastSync.ts`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `resolveCurrentGame`, `getForegroundGameWindow` (Task 1); `validateCombo` (Task 2); `captureScreenshot` (Task 3); `timerEngine.isRunning/start/pause` and `trayService.refresh` (existing).
- Produces: `Settings.keybinds: { startPauseTimer: string; saveScreenshot: string }`; `keybindService.trigger(kind)`, `.registerKind(kind, combo)`, `.registerAll()`, `.unregisterAll()`; `window.api.keybinds.set(kind, combo)`; `window.__gamutTest.triggerKeybind(kind)`; `window.api.toast.onBroadcast(cb)`; `startToastBroadcastSync()` — consumed by Task 5 (Keybinds Settings UI) and Task 11 (verification script).

This is the largest task because these pieces are tightly coupled and must compile together: the service needs the toast IPC channel to exist before it can broadcast, the IPC handler needs the service, and the dev test-hook needs both. Steps are ordered so nothing references a channel or function that doesn't exist yet at that point.

- [ ] **Step 1: Add the keybinds setting to the schema**

Modify `src/shared/types.ts` — add to the `Settings` interface, after `steamGridDbApiKey`:

```ts
  steamGridDbApiKey: string
  /** M: rebindable global hotkeys. Combo strings are validateCombo's display shape, e.g. "Ctrl+2". */
  keybinds: {
    startPauseTimer: string
    saveScreenshot: string
  }
```

Modify `src/main/store/schema.ts` — add `KeybindsSchema` right before `const SettingsSchema = ...`:

```ts
const KeybindsSchema = z
  .object({
    startPauseTimer: z.string().catch('Ctrl+F9'),
    saveScreenshot: z.string().catch('Ctrl+F10')
  })
  .catch({ startPauseTimer: 'Ctrl+F9', saveScreenshot: 'Ctrl+F10' })
```

Then add `keybinds: KeybindsSchema` inside `SettingsSchema`'s object, right after `steamGridDbApiKey: z.string().catch('')`.

- [ ] **Step 2: Add the toast, keybinds, and dev IPC channels + types**

Modify `src/shared/ipcContract.ts` — add to the `IPC` const object, after the `fonts` entry:

```ts
  keybinds: {
    set: 'keybinds:set'
  },
  toast: {
    show: 'toast:show'
  },
```

and at the very end of the `IPC` object, after `detect`, add:

```ts
  ,
  dev: {
    triggerKeybind: 'dev:triggerKeybind'
  }
```

Add these interfaces near the top, after `PopoutState`:

```ts
export type KeybindKind = 'startPauseTimer' | 'saveScreenshot'

export interface ToastBroadcastPayload {
  code: string
  kind: 'info' | 'error'
  params?: Record<string, string>
}
```

Add to the `GameTimerApi` interface, after the `fonts` block:

```ts
  keybinds: {
    /** Validates, registers (replacing any previous registration for this kind), and persists in one atomic call — see keybindService.ts. */
    set(
      kind: KeybindKind,
      combo: string
    ): Promise<{ ok: true; settings: Settings } | { ok: false; error: 'invalid_combo' | 'register_failed' }>
  }
  toast: {
    /** Toasts triggered from main (no renderer call site to react to a result — e.g. the global screenshot hotkey) arrive here as a code + params, not pre-translated text; main has no i18n instance. */
    onBroadcast(cb: (payload: ToastBroadcastPayload) => void): () => void
  }
```

- [ ] **Step 3: Implement preload for the new channels**

Modify `src/preload/index.ts` — add the import:

```ts
import type { GameTimerApi, PopoutState, TimerTickPayload, ToastBroadcastPayload } from '@shared/ipcContract'
```

Add to the `api` object, after `fonts`:

```ts
  keybinds: {
    set: (kind, combo) => ipcRenderer.invoke(IPC.keybinds.set, kind, combo)
  },
  toast: {
    onBroadcast: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ToastBroadcastPayload): void => cb(payload)
      ipcRenderer.on(IPC.toast.show, listener)
      return () => ipcRenderer.removeListener(IPC.toast.show, listener)
    }
  },
```

After the existing `contextBridge.exposeInMainWorld('api', api)` line, add a second, separate bridge for the test-only hook (kept out of the typed `GameTimerApi` surface on purpose — it's never called by real UI code):

```ts
/**
 * Real global hotkeys are OS-level input Playwright can't inject — this lets
 * a verify script call the exact handler a real key press calls (see
 * keybindService.ts / dev.ipc.ts). The main-process handler only exists when
 * GAMUT_TEST_APPDATA is set, so this is harmless in a real shipped app —
 * invoking it just gets "no handler registered" and resolves to undefined.
 */
contextBridge.exposeInMainWorld('__gamutTest', {
  triggerKeybind: (kind: 'startPauseTimer' | 'saveScreenshot') =>
    ipcRenderer.invoke(IPC.dev.triggerKeybind, kind)
})
```

- [ ] **Step 4: Write the keybind service**

Create `src/main/keybinds/keybindService.ts`:

```ts
import { BrowserWindow, globalShortcut } from 'electron'
import { IPC } from '@shared/ipcContract'
import type { KeybindKind } from '@shared/ipcContract'
import { dataStore } from '../store/dataStore'
import { timerEngine } from '../timer/timerEngine'
import { trayService } from '../tray/trayService'
import { getForegroundGameWindow, resolveCurrentGame } from '../detect/foregroundWindow'
import { captureScreenshot } from '../screenshots/captureScreenshot'

export type { KeybindKind } from '@shared/ipcContract'

function broadcastToast(code: string, kind: 'info' | 'error', params?: Record<string, string>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(IPC.toast.show, { code, kind, params })
  }
}

/** "Ctrl+2" (validateCombo's stored/display shape) -> Electron's accelerator format — the only token that differs. */
function toAccelerator(combo: string): string {
  return combo
    .split('+')
    .map((token) => (token === 'Ctrl' ? 'CommandOrControl' : token))
    .join('+')
}

const registeredCombos = new Map<KeybindKind, string>()

export const keybindService = {
  /**
   * The one handler both a real OS-level hotkey press and the
   * GAMUT_TEST_APPDATA dev IPC hook (see ipc/dev.ipc.ts) call — a Playwright
   * verify script exercises the exact same path a real key press does.
   * Resolves the "current game" itself: a linked profile's window must be
   * OS-focused (see foregroundWindow.ts's resolveCurrentGame) — not gated on
   * the timer already running, since that would make start/pause only ever
   * able to pause.
   */
  async trigger(kind: KeybindKind): Promise<void> {
    const fg = await getForegroundGameWindow()
    const name = await resolveCurrentGame(fg)
    if (!name || !fg) return

    if (kind === 'startPauseTimer') {
      if (timerEngine.isRunning(name)) timerEngine.pause(name)
      else timerEngine.start(name)
      trayService.refresh()
      return
    }

    try {
      const result = await captureScreenshot(name, fg)
      broadcastToast(result.fallback ? 'screenshot_fallback' : 'screenshot_saved', 'info', { name })
    } catch {
      broadcastToast('screenshot_failed', 'error', { name })
    }
  },

  /** Registers one keybind, replacing any previous registration for the same kind. Returns false if the OS/another app already owns the combo — surfaced to the Keybinds tab as an inline error, never swallowed. */
  registerKind(kind: KeybindKind, combo: string): boolean {
    const previous = registeredCombos.get(kind)
    if (previous) globalShortcut.unregister(toAccelerator(previous))
    const ok = globalShortcut.register(toAccelerator(combo), () => void keybindService.trigger(kind))
    if (ok) registeredCombos.set(kind, combo)
    else registeredCombos.delete(kind)
    return ok
  },

  /** Called once at startup with whatever's currently saved. */
  registerAll(): void {
    const { keybinds } = dataStore.get().settings
    keybindService.registerKind('startPauseTimer', keybinds.startPauseTimer)
    keybindService.registerKind('saveScreenshot', keybinds.saveScreenshot)
  },

  /** Called on quit — an unregistered global hotkey would otherwise keep intercepting the combo system-wide after the app closes. */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
    registeredCombos.clear()
  }
}
```

- [ ] **Step 5: Write the keybinds and dev IPC handlers**

Create `src/main/ipc/keybinds.ipc.ts`:

```ts
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import type { KeybindKind } from '@shared/ipcContract'
import { validateCombo } from '@shared/validateCombo'
import { dataStore } from '../store/dataStore'
import { keybindService } from '../keybinds/keybindService'

export function registerKeybindsIpc(): void {
  ipcMain.handle(IPC.keybinds.set, (_e, kind: KeybindKind, combo: string) => {
    if (!validateCombo(combo)) return { ok: false, error: 'invalid_combo' as const }
    if (!keybindService.registerKind(kind, combo)) return { ok: false, error: 'register_failed' as const }
    const settings = dataStore.get().settings
    settings.keybinds = { ...settings.keybinds, [kind]: combo }
    void dataStore.safeSave()
    return { ok: true, settings }
  })
}
```

Create `src/main/ipc/dev.ipc.ts`:

```ts
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import type { KeybindKind } from '@shared/ipcContract'
import { keybindService } from '../keybinds/keybindService'

/**
 * Real global hotkeys are OS-level input Playwright can't inject — this lets
 * a verify script exercise the exact same handler a real key press calls,
 * instead of a differently-behaved test double. Only registered when
 * GAMUT_TEST_APPDATA is set (the same flag every verify script already sets
 * to isolate its save data — see feedback-isolate-gamut-test-launches), so a
 * real launch never registers this handler at all.
 */
export function registerDevIpc(): void {
  if (!process.env.GAMUT_TEST_APPDATA) return
  ipcMain.handle(IPC.dev.triggerKeybind, (_e, kind: KeybindKind) => keybindService.trigger(kind))
}
```

- [ ] **Step 6: Wire the new handlers into registerAll**

Modify `src/main/ipc/registerAll.ts` — add imports:

```ts
import { registerKeybindsIpc } from './keybinds.ipc'
import { registerDevIpc } from './dev.ipc'
```

Add calls at the end of `registerAllIpcHandlers`, after `registerNotesIpc()`:

```ts
  registerKeybindsIpc()
  registerDevIpc()
```

- [ ] **Step 7: Register keybinds at startup and unregister on quit**

Modify `src/main/index.ts` — add the import:

```ts
import { keybindService } from './keybinds/keybindService'
```

Add `keybindService.registerAll()` right after `gameWatcher.sync()`. Add a quit handler right after the `app.on('window-all-closed', ...)` block:

```ts
  // An unregistered global hotkey would otherwise keep intercepting its
  // combo system-wide after the app has closed.
  app.on('will-quit', () => keybindService.unregisterAll())
```

- [ ] **Step 8: Add the renderer-side toast broadcast subscription**

Create `src/renderer/src/state/toastBroadcastSync.ts`:

```ts
import i18n from '../i18n/i18n'
import { toast } from '../components/common/Toast'

const KEY_BY_CODE: Record<string, string> = {
  screenshot_saved: 'toast_screenshot_saved',
  screenshot_fallback: 'toast_screenshot_fallback',
  screenshot_failed: 'err_screenshot_failed'
}

/** Toasts triggered from main (e.g. the global screenshot hotkey) arrive as a code + params, translated here since main has no i18n instance — see the IPC contract's ToastBroadcastPayload doc. */
export function startToastBroadcastSync(): () => void {
  return window.api.toast.onBroadcast(({ code, kind, params }) => {
    const message = i18n.t(KEY_BY_CODE[code] ?? code, params)
    if (kind === 'error') toast.error(message)
    else toast.info(message)
  })
}
```

Modify `src/renderer/src/App.tsx` — add the import:

```ts
import { startToastBroadcastSync } from './state/toastBroadcastSync'
```

Add the call inside the existing startup `useEffect`, alongside `startNotesPopoutSync()`:

```ts
    startToastBroadcastSync()
```

- [ ] **Step 9: Add the new locale keys**

Modify `src/renderer/src/locales/en/common.json`. Read the file first to find the exact alphabetical insertion points (it's fully alphabetically sorted by key). Add:

```json
"err_keybind_invalid": "Combos need a modifier first (Shift, Ctrl, Alt or Tab), e.g. Ctrl+2. A 3-key combo must start Ctrl+Tab+…",
"err_keybind_register_failed": "Couldn't register this combo — it may already be in use by another application.",
```
(near the existing `err_*` keys)

```json
"err_screenshot_failed": "Couldn't capture a screenshot for {{name}}",
```
(near the other `err_*` keys, alphabetically after `err_screenshot_failed`'s neighbors)

```json
"toast_screenshot_fallback": "Captured the full screen — couldn't isolate {{name}}'s window",
"toast_screenshot_saved": "Screenshot saved",
```
(near any existing `toast_*`/`t*` cluster — insert alphabetically)

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/shared/types.ts src/main/store/schema.ts src/shared/ipcContract.ts src/preload/index.ts src/main/keybinds/keybindService.ts src/main/ipc/keybinds.ipc.ts src/main/ipc/dev.ipc.ts src/main/ipc/registerAll.ts src/main/index.ts src/renderer/src/state/toastBroadcastSync.ts src/renderer/src/App.tsx src/renderer/src/locales/en/common.json
git commit -m "M: add keybind service, registration, and toast broadcast IPC"
```

---

### Task 5: Keybinds Settings UI

**Files:**
- Create: `src/renderer/src/components/dialogs/KeybindsSettings.tsx`
- Modify: `src/renderer/src/components/dialogs/SettingsDialog.tsx`
- Modify: `src/renderer/src/locales/en/common.json`

**Interfaces:**
- Consumes: `window.api.keybinds.set(kind, combo)` (Task 4); `useSettingsStore` (existing, `src/renderer/src/state/settingsStore.ts`).
- Produces: `KeybindsSettings` component, exported `ToggleRow` from `SettingsDialog.tsx` (reused by Task 10's Overlay Settings UI).

- [ ] **Step 1: Export ToggleRow from SettingsDialog for reuse**

Modify `src/renderer/src/components/dialogs/SettingsDialog.tsx` — change `function ToggleRow(` to `export function ToggleRow(`.

- [ ] **Step 2: Write the Keybinds tab component**

Create `src/renderer/src/components/dialogs/KeybindsSettings.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../state/settingsStore'
import type { KeybindKind } from '@shared/ipcContract'

const ROWS: { kind: KeybindKind; labelKey: string }[] = [
  { kind: 'startPauseTimer', labelKey: 'label_keybind_start_pause' },
  { kind: 'saveScreenshot', labelKey: 'label_keybind_screenshot' }
]

/** Normalizes a KeyboardEvent into the token shape validateCombo expects (shared/validateCombo.ts). */
function normalizeKey(e: KeyboardEvent): string {
  if (e.key === 'Control') return 'Ctrl'
  if (e.key === ' ') return 'Space'
  if (e.key.length === 1) return e.key.toUpperCase()
  return e.key
}

/**
 * M: a "click to record" control per keybind. Listens for keydown/keyup
 * directly rather than a controlled <input> — a hotkey combo is inherently a
 * multi-key gesture, not text entry. Finalizes and sends the combo to main
 * (validate + register + persist, atomically — see keybindService.ts) the
 * moment any key is released, so holding Ctrl+2 and releasing 2 first (the
 * natural way to press a combo) is what ends capture.
 */
export function KeybindsSettings(): React.JSX.Element | null {
  const { t } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  const [capturing, setCapturing] = useState<KeybindKind | null>(null)
  const [errors, setErrors] = useState<Partial<Record<KeybindKind, 'invalid_combo' | 'register_failed'>>>({})

  if (!settings) return null

  function startCapture(kind: KeybindKind): void {
    setErrors((e) => ({ ...e, [kind]: undefined }))
    setCapturing(kind)
    const pressed: string[] = []

    function onKeyDown(e: KeyboardEvent): void {
      e.preventDefault()
      const key = normalizeKey(e)
      if (!pressed.includes(key)) pressed.push(key)
    }

    async function onKeyUp(e: KeyboardEvent): Promise<void> {
      e.preventDefault()
      if (pressed.length === 0) return
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      setCapturing(null)
      const combo = pressed.join('+')
      const result = await window.api.keybinds.set(kind, combo)
      if (result.ok) {
        useSettingsStore.getState().setSettings(result.settings)
      } else {
        setErrors((e2) => ({ ...e2, [kind]: result.error }))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  }

  return (
    <div className="flex flex-col gap-3">
      {ROWS.map(({ kind, labelKey }) => (
        <div key={kind} className="flex flex-col gap-1">
          <div className="flex items-center justify-between rounded bg-card px-3 py-2.5 text-sm text-text">
            <span>{t(labelKey)}</span>
            <button
              onClick={() => startCapture(kind)}
              className={`rounded px-3 py-1 font-mono text-xs ${
                capturing === kind ? 'bg-accent text-bg' : 'bg-panel text-text hover:bg-panel/70'
              }`}
            >
              {capturing === kind ? t('keybind_capture_listening') : settings.keybinds[kind]}
            </button>
          </div>
          {errors[kind] && (
            <span className="text-xs text-red">
              {t(errors[kind] === 'invalid_combo' ? 'err_keybind_invalid' : 'err_keybind_register_failed')}
            </span>
          )}
        </div>
      ))}
      <span className="text-xs text-subtext">{t('keybind_capture_hint')}</span>
    </div>
  )
}
```

- [ ] **Step 3: Wire the tab into SettingsDialog**

Modify `src/renderer/src/components/dialogs/SettingsDialog.tsx` — add the import:

```ts
import { KeybindsSettings } from './KeybindsSettings'
```

Change the `Tab` type to include it:

```ts
type Tab = 'general' | 'games' | 'launchers' | 'keybinds' | 'appearance' | 'language'
```

Add to the `TABS` array, after the `games` entry:

```ts
    { id: 'keybinds', label: t('tab_keybinds') },
```

Add the content block, after the `games` tab's closing `)}`:

```tsx
      {tab === 'keybinds' && <KeybindsSettings />}
```

- [ ] **Step 4: Add the new locale keys**

Modify `src/renderer/src/locales/en/common.json`. Insert alphabetically:

```json
"keybind_capture_hint": "Click a combo, then press it — releasing any key finishes it",
"keybind_capture_listening": "Press a combo…",
```

```json
"label_keybind_screenshot": "Save Screenshot",
"label_keybind_start_pause": "Start / Pause Timer",
```
(near the existing `label_*` cluster, alphabetically — `label_keybind_screenshot` before `label_keybind_start_pause`)

```json
"tab_keybinds": "Keybinds",
```
(in the `tab_*` cluster — alphabetically right after `tab_general` per the keys already confirmed at that location, before `tab_language`)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/dialogs/KeybindsSettings.tsx src/renderer/src/components/dialogs/SettingsDialog.tsx src/renderer/src/locales/en/common.json
git commit -m "M: add Keybinds Settings tab"
```

---

### Task 6: Screenshots listing/open IPC

**Files:**
- Modify: `src/shared/ipcContract.ts`
- Modify: `src/preload/index.ts`
- Create: `src/main/ipc/screenshots.ipc.ts`
- Modify: `src/main/ipc/registerAll.ts`
- Modify: `src/main/protocol.ts`

**Interfaces:**
- Consumes: `listScreenshots` (Task 3); `paths.screenshotsDir` (Task 3).
- Produces: `window.api.screenshots.list(name)`, `window.api.screenshots.open(filePath)`; the `gt-asset://screenshots/<profile>/<file>` URL scheme — consumed by Task 7 (gallery UI).

- [ ] **Step 1: Add the screenshots IPC channels and types**

Modify `src/shared/ipcContract.ts` — add to the `IPC` const, after the `keybinds`/`toast` entries added in Task 4:

```ts
  screenshots: {
    list: 'screenshots:list',
    open: 'screenshots:open'
  },
```

Add to `GameTimerApi`, after the `keybinds` block:

```ts
  screenshots: {
    /** Newest-first absolute file paths. */
    list(name: string): Promise<string[]>
    open(filePath: string): Promise<void>
  }
```

- [ ] **Step 2: Implement preload**

Modify `src/preload/index.ts` — add to the `api` object, after `keybinds`:

```ts
  screenshots: {
    list: (name) => ipcRenderer.invoke(IPC.screenshots.list, name),
    open: (filePath) => ipcRenderer.invoke(IPC.screenshots.open, filePath)
  },
```

- [ ] **Step 3: Write the IPC handler**

Create `src/main/ipc/screenshots.ipc.ts`:

```ts
import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipcContract'
import { listScreenshots } from '../screenshots/captureScreenshot'

export function registerScreenshotsIpc(): void {
  ipcMain.handle(IPC.screenshots.list, (_e, name: string) => listScreenshots(name))
  ipcMain.handle(IPC.screenshots.open, (_e, filePath: string) => shell.openPath(filePath))
}
```

- [ ] **Step 4: Wire it into registerAll**

Modify `src/main/ipc/registerAll.ts` — add the import `import { registerScreenshotsIpc } from './screenshots.ipc'` and add `registerScreenshotsIpc()` after `registerDevIpc()`.

- [ ] **Step 5: Serve screenshot thumbnails via the existing gt-asset:// protocol**

Modify `src/main/protocol.ts` — add the import `import { isInside } from './util/safePath'` is already imported; add a new branch inside `registerAssetProtocolHandler`'s handler, before the existing `fileName`/`dir` block (screenshots need two path segments — profile name and filename — unlike the flat icons/backgrounds/covers dirs):

```ts
    if (kind === 'screenshots') {
      const segments = url.pathname
        .replace(/^\/+/, '')
        .split('/')
        .map((s) => decodeURIComponent(s))
      if (segments.length !== 2) return new Response('Not found', { status: 404 })
      const [profileName, fileName] = segments
      const dir = paths.screenshotsDir(profileName)
      const full = join(dir, fileName)
      if (!isInside(dir, full)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(full).toString())
    }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipcContract.ts src/preload/index.ts src/main/ipc/screenshots.ipc.ts src/main/ipc/registerAll.ts src/main/protocol.ts
git commit -m "N: add screenshots list/open IPC and gt-asset:// serving"
```

---

### Task 7: Screenshots gallery UI

**Files:**
- Create: `src/renderer/src/components/dialogs/ScreenshotsDialog.tsx`
- Modify: `src/renderer/src/state/uiStore.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/library/LibraryDetail.tsx`
- Modify: `src/renderer/src/locales/en/common.json`

**Interfaces:**
- Consumes: `window.api.screenshots.list/open` (Task 6).
- Produces: `ScreenshotsDialog` component; `'screenshots'` added to `DialogKind`.

- [ ] **Step 1: Add the dialog kind**

Modify `src/renderer/src/state/uiStore.ts` — add `'screenshots'` to the `DialogKind` union, after `'notes'`:

```ts
export type DialogKind =
  | 'modify'
  | 'notes'
  | 'screenshots'
  | 'settings'
```

- [ ] **Step 2: Write the gallery dialog**

Create `src/renderer/src/components/dialogs/ScreenshotsDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

/** N: a per-game gallery of screenshots captured via the M2 hotkey — grid of thumbnails, click one to open it in the OS's default viewer. */
export function ScreenshotsDialog({ name, onClose }: { name: string; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [files, setFiles] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void window.api.screenshots.list(name).then((f) => {
      setFiles(f)
      setLoaded(true)
    })
  }, [name])

  return (
    <Modal title={t('dlg_screenshots_title', { name })} onClose={onClose} width="max-w-2xl">
      {loaded && files.length === 0 && (
        <div className="py-8 text-center text-sm text-subtext">{t('screenshots_empty')}</div>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {files.map((filePath) => (
          <button
            key={filePath}
            onClick={() => void window.api.screenshots.open(filePath)}
            className="aspect-video overflow-hidden rounded bg-card hover:opacity-80"
          >
            <img
              src={`gt-asset://screenshots/${encodeURIComponent(name)}/${encodeURIComponent(basename(filePath))}`}
              alt=""
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: Wire the dialog into App**

Modify `src/renderer/src/App.tsx` — add the import `import { ScreenshotsDialog } from './components/dialogs/ScreenshotsDialog'` and add, after the `notes` dialog block:

```tsx
      {dialog === 'screenshots' && dialogTarget && (
        <ScreenshotsDialog name={dialogTarget} onClose={closeDialog} />
      )}
```

- [ ] **Step 4: Add the Library detail action button**

Modify `src/renderer/src/components/library/LibraryDetail.tsx` — in the action-bar array (the `[{ label: t('ctx_modify'), ... }, ...]` list), insert a new entry between `ctx_export` and `ctx_import`:

```tsx
          { label: t('ctx_export'), onClick: () => void handleExport() },
          { label: t('ctx_screenshots'), onClick: () => openDialog('screenshots', name) },
          { label: t('ctx_import'), onClick: () => void handleImport() },
```

- [ ] **Step 5: Add the new locale keys**

Modify `src/renderer/src/locales/en/common.json`. Insert alphabetically:

```json
"ctx_screenshots": "Screenshots",
```
(right after `"ctx_reset_time"`, the last entry in the existing `ctx_*` cluster)

```json
"dlg_screenshots_title": "Screenshots — {{name}}",
```
(alongside any existing `dlg_*` keys)

```json
"screenshots_empty": "No screenshots yet",
```
(alphabetically among `s*` keys)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/dialogs/ScreenshotsDialog.tsx src/renderer/src/state/uiStore.ts src/renderer/src/App.tsx src/renderer/src/components/library/LibraryDetail.tsx src/renderer/src/locales/en/common.json
git commit -m "N: add screenshots gallery dialog"
```

---

### Task 8: Overlay settings schema and window service

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/store/schema.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/ipcContract.ts`
- Modify: `src/preload/index.ts`
- Create: `src/main/overlay/overlayWindow.ts`
- Modify: `src/main/store/settingsService.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `getForegroundGameWindow`, `resolveCurrentGame` (Task 1); `timerEngine.isRunning`, `timerEngine.onTick` (existing); `resolveAsset` (existing, `src/main/util/env.ts`).
- Produces: `Settings.overlay: { enabled; corner; scale; shadow }`; `OverlayCorner` type; `overlayWindow.start()/.stop()/.onSettingsChanged()`; `window.api.overlay.onTick(cb)` — consumed by Task 9 (overlay renderer) and Task 10 (Overlay Settings UI, via the existing generic `settings:update` — no dedicated overlay-settings IPC needed).

- [ ] **Step 1: Add the overlay setting to the schema**

Modify `src/shared/types.ts` — add near the top, after `ThemeColors`:

```ts
export type OverlayCorner = 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
```

Add to the `Settings` interface, after `keybinds` (added in Task 4):

```ts
  /** O: the in-game overlay's visibility, position, size, and text-shadow. */
  overlay: {
    enabled: boolean
    corner: OverlayCorner
    scale: number
    shadow: boolean
  }
```

Modify `src/main/store/schema.ts` — add before `const SettingsSchema`:

```ts
const OverlayCornerSchema = z
  .enum(['top-left', 'top-right', 'top-center', 'bottom-left', 'bottom-right', 'bottom-center'])
  .catch('top-right')

const OverlaySchema = z
  .object({
    enabled: z.boolean().catch(false),
    corner: OverlayCornerSchema,
    scale: z.number().catch(1.0),
    shadow: z.boolean().catch(true)
  })
  .catch({ enabled: false, corner: 'top-right', scale: 1.0, shadow: true })
```

Add `overlay: OverlaySchema` inside `SettingsSchema`, after `keybinds: KeybindsSchema`.

- [ ] **Step 2: Add the overlay scale range constants**

Modify `src/shared/constants.ts` — add after `FONT_SCALE_MAX`:

```ts
export const OVERLAY_SCALE_MIN = 0.5
export const OVERLAY_SCALE_MAX = 2.0
```

- [ ] **Step 3: Add the overlay tick IPC channel and type**

Modify `src/shared/ipcContract.ts` — add to the `IPC` const, after `screenshots`:

```ts
  overlay: {
    tick: 'overlay:tick'
  },
```

Add near `TimerTickPayload`:

```ts
export interface OverlayTickPayload {
  seconds: number
  running: boolean
  scale: number
  shadow: boolean
}
```

Add to `GameTimerApi`, after `screenshots`:

```ts
  overlay: {
    onTick(cb: (payload: OverlayTickPayload) => void): () => void
  }
```

- [ ] **Step 4: Implement preload for the overlay tick channel**

Modify `src/preload/index.ts` — add `OverlayTickPayload` to the type import, and add to the `api` object, after `screenshots`:

```ts
  overlay: {
    onTick: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: OverlayTickPayload): void => cb(payload)
      ipcRenderer.on(IPC.overlay.tick, listener)
      return () => ipcRenderer.removeListener(IPC.overlay.tick, listener)
    }
  },
```

- [ ] **Step 5: Write the overlay window service**

Create `src/main/overlay/overlayWindow.ts`:

```ts
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { IPC } from '@shared/ipcContract'
import type { OverlayCorner } from '@shared/types'
import { dataStore } from '../store/dataStore'
import { timerEngine } from '../timer/timerEngine'
import { getForegroundGameWindow, resolveCurrentGame } from '../detect/foregroundWindow'
import { resolveAsset } from '../util/env'

/**
 * O: a small, transparent, click-through, always-on-top window showing
 * session time + a tracking dot over the currently focused, linked game.
 * Positioning is slow-polled (getForegroundGameWindow shells out to
 * PowerShell) but the displayed TIME piggybacks on the existing 500ms
 * timerEngine tick loop instead of its own poll — see pushTick.
 */
const BASE_WIDTH = 220
const BASE_HEIGHT = 56
const MARGIN = 16
const POLL_MS = 2000

let win: BrowserWindow | null = null
let pollHandle: ReturnType<typeof setInterval> | null = null
let currentName: string | null = null
let tickUnsubscribe: (() => void) | null = null

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  win = new BrowserWindow({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    // A small utility window has no business going OS-fullscreen — see
    // drawingPopout.ts's identical precedent and the fullscreen-lockout bug
    // it was added to fix.
    fullscreenable: false,
    show: false,
    icon: resolveAsset('icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.setIgnoreMouseEvents(true, { forward: true })
  const url = pathToFileURL(join(__dirname, '../renderer/index.html'))
  url.hash = 'overlay'
  void win.loadURL(url.toString())
  win.on('closed', () => {
    win = null
  })
  return win
}

function positionFor(bounds: Electron.Rectangle, corner: OverlayCorner, scale: number): Electron.Rectangle {
  const display = screen.getDisplayMatching(bounds)
  const width = Math.round(BASE_WIDTH * scale)
  const height = Math.round(BASE_HEIGHT * scale)
  const area = display.workArea
  const left = area.x + MARGIN
  const right = area.x + area.width - width - MARGIN
  const top = area.y + MARGIN
  const bottom = area.y + area.height - height - MARGIN
  const centerX = area.x + Math.round((area.width - width) / 2)
  const positions: Record<OverlayCorner, { x: number; y: number }> = {
    'top-left': { x: left, y: top },
    'top-right': { x: right, y: top },
    'top-center': { x: centerX, y: top },
    'bottom-left': { x: left, y: bottom },
    'bottom-right': { x: right, y: bottom },
    'bottom-center': { x: centerX, y: bottom }
  }
  const { x, y } = positions[corner]
  return { x, y, width, height }
}

async function poll(): Promise<void> {
  const { overlay } = dataStore.get().settings
  if (!overlay.enabled) {
    currentName = null
    if (win && !win.isDestroyed()) win.hide()
    return
  }
  const fg = await getForegroundGameWindow()
  const name = await resolveCurrentGame(fg)
  if (!name || !fg) {
    currentName = null
    if (win && !win.isDestroyed()) win.hide()
    return
  }
  currentName = name
  const w = ensureWindow()
  w.setBounds(positionFor(fg.bounds, overlay.corner, overlay.scale))
  // showInactive, never show() — stealing OS focus for the overlay would make
  // IT the foreground window on the next poll, hiding itself in a loop.
  w.showInactive()
}

function pushTick(running: Record<string, number>): void {
  if (!currentName || !win || win.isDestroyed() || win.webContents.isDestroyed()) return
  const { overlay } = dataStore.get().settings
  const profile = dataStore.get().profiles[currentName]
  const isRunning = currentName in running
  const seconds = isRunning ? running[currentName] : (profile?.seconds ?? 0)
  win.webContents.send(IPC.overlay.tick, {
    seconds,
    running: isRunning,
    scale: overlay.scale,
    shadow: overlay.shadow
  })
}

export const overlayWindow = {
  start(): void {
    if (pollHandle) return
    pollHandle = setInterval(() => void poll(), POLL_MS)
    void poll()
    tickUnsubscribe = timerEngine.onTick(({ running }) => pushTick(running))
  },

  stop(): void {
    if (pollHandle) clearInterval(pollHandle)
    pollHandle = null
    tickUnsubscribe?.()
    tickUnsubscribe = null
    if (win && !win.isDestroyed()) win.close()
    win = null
    currentName = null
  },

  /** Called by settingsService right after an overlay.* patch, so toggling/repositioning reacts immediately instead of waiting up to POLL_MS for the next tick. */
  onSettingsChanged(): void {
    void poll()
  }
}
```

- [ ] **Step 6: React to overlay settings changes**

Modify `src/main/store/settingsService.ts` — add the import `import { overlayWindow } from '../overlay/overlayWindow'` and add, inside `updateSettings`, alongside the existing `if (patch.trayEnabled !== undefined) ...` line:

```ts
  if (patch.overlay !== undefined) overlayWindow.onSettingsChanged()
```

- [ ] **Step 7: Start/stop the overlay poll loop with the app**

Modify `src/main/index.ts` — add the import `import { overlayWindow } from './overlay/overlayWindow'`, add `overlayWindow.start()` after `keybindService.registerAll()`, and add `overlayWindow.stop()` inside the `will-quit` handler added in Task 4:

```ts
  app.on('will-quit', () => {
    keybindService.unregisterAll()
    overlayWindow.stop()
  })
```

(replacing the single-line version from Task 4's Step 7)

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types.ts src/main/store/schema.ts src/shared/constants.ts src/shared/ipcContract.ts src/preload/index.ts src/main/overlay/overlayWindow.ts src/main/store/settingsService.ts src/main/index.ts
git commit -m "O: add overlay settings schema and window service"
```

---

### Task 9: Overlay renderer app

**Files:**
- Create: `src/renderer/src/components/overlay/OverlayApp.tsx`
- Modify: `src/renderer/src/main.tsx`

**Interfaces:**
- Consumes: `window.api.overlay.onTick(cb)` (Task 8); `formatSeconds` (existing, `@shared/format`); `GREEN`, `RED` (existing, `@shared/constants`).
- Produces: `OverlayApp` component, routed at the `#overlay` hash.

- [ ] **Step 1: Write the overlay's renderer content**

Create `src/renderer/src/components/overlay/OverlayApp.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { formatSeconds } from '@shared/format'
import { GREEN, RED } from '@shared/constants'
import type { OverlayTickPayload } from '@shared/ipcContract'

/**
 * O: the whole content of the overlay window — opened by overlayWindow.ts at
 * index.html#overlay. Transparent by design (the BrowserWindow itself is
 * transparent: true; this overrides the shared stylesheet's opaque body
 * background, which every OTHER window in this app wants).
 */
export function OverlayApp(): React.JSX.Element {
  const [state, setState] = useState<OverlayTickPayload | null>(null)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  useEffect(() => window.api.overlay.onTick(setState), [])

  if (!state) return <div />

  const shadow = state.shadow ? '0 1px 3px rgba(0,0,0,0.9)' : undefined

  return (
    <div className="flex h-full items-center gap-2 px-3" style={{ fontSize: `${16 * state.scale}px` }}>
      <span
        className="shrink-0 rounded-full"
        style={{
          width: '0.6em',
          height: '0.6em',
          backgroundColor: state.running ? GREEN : RED,
          boxShadow: shadow
        }}
      />
      <span className="font-mono font-semibold text-white tabular-nums" style={{ textShadow: shadow }}>
        {formatSeconds(state.seconds)}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Route the #overlay hash to it**

Modify `src/renderer/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DrawingPopoutApp } from './components/dialogs/notes/DrawingPopoutApp'
import { OverlayApp } from './components/overlay/OverlayApp'
import { APP_DISPLAY_NAME } from '@shared/channel'
import './i18n/i18n'
import './styles/tailwind.css'

const isDrawingPopout = window.location.hash.startsWith('#drawing-popout')
const isOverlay = window.location.hash.startsWith('#overlay')

if (!isDrawingPopout && !isOverlay) document.title = APP_DISPLAY_NAME

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isDrawingPopout ? <DrawingPopoutApp /> : isOverlay ? <OverlayApp /> : <App />}</StrictMode>
)
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/overlay/OverlayApp.tsx src/renderer/src/main.tsx
git commit -m "O: add overlay renderer view"
```

---

### Task 10: Overlay Settings UI

**Files:**
- Create: `src/renderer/src/components/dialogs/OverlaySettings.tsx`
- Modify: `src/renderer/src/components/dialogs/SettingsDialog.tsx`
- Modify: `src/renderer/src/locales/en/common.json`

**Interfaces:**
- Consumes: `updateSettings`, `updateSettingsOptimistic`, `useSettingsStore` (existing); `ToggleRow` (exported in Task 5); `OVERLAY_SCALE_MIN`/`MAX` (Task 8).

Overlay settings reuse the existing generic `settings:update` IPC — unlike keybinds, there's no OS-level "registration" step to make atomic, so no dedicated IPC channel is needed here.

- [ ] **Step 1: Write the Overlay tab component**

Create `src/renderer/src/components/dialogs/OverlaySettings.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { useSettingsStore, updateSettings, updateSettingsOptimistic } from '../../state/settingsStore'
import { ToggleRow } from './SettingsDialog'
import { OVERLAY_SCALE_MIN, OVERLAY_SCALE_MAX } from '@shared/constants'
import type { OverlayCorner } from '@shared/types'

const CORNERS: OverlayCorner[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
]

export function OverlaySettings(): React.JSX.Element | null {
  const { t } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  if (!settings) return null
  const overlay = settings.overlay

  return (
    <div className="flex flex-col gap-4">
      <ToggleRow
        label={t('label_overlay_enabled')}
        checked={overlay.enabled}
        onChange={(v) => void updateSettings({ overlay: { ...overlay, enabled: v } })}
      />

      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_overlay_position')}</label>
        <div className="grid grid-cols-3 gap-1.5">
          {CORNERS.map((corner) => (
            <button
              key={corner}
              onClick={() => void updateSettings({ overlay: { ...overlay, corner } })}
              className={`rounded px-2 py-1.5 text-xs ${
                overlay.corner === corner ? 'bg-accent text-bg' : 'bg-card text-text hover:bg-card/70'
              }`}
            >
              {t(`overlay_corner_${corner.replace(/-/g, '_')}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-subtext">
          {t('label_overlay_size')} — {overlay.scale.toFixed(1)}x
        </label>
        <input
          type="range"
          min={OVERLAY_SCALE_MIN}
          max={OVERLAY_SCALE_MAX}
          step={0.1}
          value={overlay.scale}
          onChange={(e) => updateSettingsOptimistic({ overlay: { ...overlay, scale: parseFloat(e.target.value) } })}
          className="w-full"
        />
      </div>

      <ToggleRow
        label={t('label_overlay_shadow')}
        checked={overlay.shadow}
        onChange={(v) => void updateSettings({ overlay: { ...overlay, shadow: v } })}
      />
    </div>
  )
}
```

- [ ] **Step 2: Wire the tab into SettingsDialog**

Modify `src/renderer/src/components/dialogs/SettingsDialog.tsx` — add the import `import { OverlaySettings } from './OverlaySettings'`. Change the `Tab` type:

```ts
type Tab = 'general' | 'games' | 'launchers' | 'keybinds' | 'overlay' | 'appearance' | 'language'
```

Add to `TABS`, right after the `keybinds` entry added in Task 5:

```ts
    { id: 'overlay', label: t('tab_overlay') },
```

Add the content block, after the `keybinds` block:

```tsx
      {tab === 'overlay' && <OverlaySettings />}
```

- [ ] **Step 3: Add the new locale keys**

Modify `src/renderer/src/locales/en/common.json`. Insert alphabetically:

```json
"label_overlay_enabled": "Show in-game overlay",
"label_overlay_position": "Position",
"label_overlay_shadow": "Text shadow",
"label_overlay_size": "Size",
```

```json
"overlay_corner_bottom_center": "Bottom Center",
"overlay_corner_bottom_left": "Bottom Left",
"overlay_corner_bottom_right": "Bottom Right",
"overlay_corner_top_center": "Top Center",
"overlay_corner_top_left": "Top Left",
"overlay_corner_top_right": "Top Right",
```

```json
"tab_overlay": "Overlay",
```
(in the `tab_*` cluster, alphabetically after `tab_modify_time`/before `tab_profile_stats` — check against the file's actual neighbors)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/dialogs/OverlaySettings.tsx src/renderer/src/components/dialogs/SettingsDialog.tsx src/renderer/src/locales/en/common.json
git commit -m "O: add Overlay Settings tab"
```

---

### Task 11: End-to-end verification

**Files:**
- Create: `scripts/verify-keybinds-screenshots-overlay.cjs`

**Interfaces:**
- Consumes: everything from Tasks 1–10, driven through the real packaged app exactly as `scripts/verify-notes.cjs` does for L.

Per this project's established rule (a browser approximation of the renderer bundle is not sufficient for Electron main-process behavior — see project memory), this is the actual proof the feature works, not the unit tests from Tasks 1–2 alone. Uses three test seams: `GAMUT_TEST_APPDATA` (isolates save data, existing convention), `GAMUT_TEST_DOCUMENTS` (isolates the screenshot folder, added in Task 3), and `GAMUT_TEST_FOREGROUND` + `window.__gamutTest.triggerKeybind` (fakes OS focus and real hotkey presses, added in Tasks 1 and 4 — neither is something Playwright can produce for real).

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: succeeds, produces `out/main/index.js`.

- [ ] **Step 2: Write the verification script**

Create `scripts/verify-keybinds-screenshots-overlay.cjs`:

```js
/*
 * M/N/O: global keybinds (start/pause + screenshot), the screenshot gallery,
 * and the in-game overlay — driven through the real packaged app. Uses three
 * test seams neither Playwright nor a real OS key press can provide:
 *   - GAMUT_TEST_FOREGROUND fakes "which window is OS-focused" instead of
 *     depending on whatever really has focus during a CI/dev run.
 *   - window.__gamutTest.triggerKeybind(kind) calls the exact handler a real
 *     global hotkey press calls — actual OS-level global hotkeys aren't
 *     something Playwright can inject.
 *   - GAMUT_TEST_DOCUMENTS isolates the screenshot folder, same reasoning as
 *     GAMUT_TEST_APPDATA isolates save data (feedback-isolate-gamut-test-launches).
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-kso-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const DOCS = path.join(SCRATCH, 'documents')
const DATA = path.join(ROOT, 'game_timer_data.json')
const BUNDLE = path.join(__dirname, '..', 'out', 'main', 'index.js')

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`
  )
}

function game(name, extra = {}) {
  return {
    name, seconds: 0, iconFile: null, bgColor: null, bgImage: null,
    status: 'in_progress', statusAt: null, statusSeconds: null, genres: [],
    lastPlayed: null, startedDate: null, notes: '', noteList: [], rating: 0,
    sessionStats: { count: 0, totalSeconds: 0, longestSeconds: 0, firstPlayedAt: null, lastPlayedAt: null },
    sessionLog: [], activeSession: null, exePath: null, steamAppId: null,
    launchUri: null, installDir: null, autoFetchArt: null, launches: 0,
    openSeconds: 0, autoStartTimer: null, genresFromDetection: false,
    favorite: false, coverFile: null, ...extra
  }
}

const readProfiles = () => JSON.parse(fs.readFileSync(DATA, 'utf8')).profiles

/** Isolates app.getPath('appData') the same way every other verify script does — see feedback-isolate-gamut-test-launches. Idempotent. */
function ensureBundlePatched() {
  const original = fs.readFileSync(BUNDLE, 'utf8')
  if (original.includes('GAMUT_TEST_APPDATA')) return
  const target = 'electron.app.getPath("appData")'
  if (!original.includes(target)) {
    throw new Error(
      `Could not find ${JSON.stringify(target)} in ${BUNDLE} to patch — the compiled output shape may have changed; inspect it and update this script's replace target.`
    )
  }
  fs.writeFileSync(
    BUNDLE,
    original.replace(target, '(process.env.GAMUT_TEST_APPDATA || electron.app.getPath("appData"))')
  )
}

function seed(overlayEnabled) {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  fs.mkdirSync(DOCS, { recursive: true })
  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {
        'Focused Game': game('Focused Game', { installDir: 'C:\\Games\\FocusedGame' })
      },
      lastSelected: null,
      settings: {
        trayEnabled: false,
        checkForUpdates: false,
        language: 'en',
        autoFetchArt: false,
        keybinds: { startPauseTimer: 'Ctrl+F9', saveScreenshot: 'Ctrl+F10' },
        overlay: { enabled: overlayEnabled, corner: 'top-right', scale: 1, shadow: true }
      }
    })
  )
}

const FOCUSED_ON_GAME = JSON.stringify({
  ExePath: 'C:\\Games\\FocusedGame\\game.exe',
  Title: 'Focused Game Window',
  X: 0,
  Y: 0,
  Width: 1920,
  Height: 1080
})

async function launch(foreground, overlayEnabled) {
  seed(overlayEnabled)
  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      GAMUT_TEST_APPDATA: SCRATCH,
      GAMUT_TEST_DOCUMENTS: DOCS,
      GAMUT_TEST_FOREGROUND: foreground
    }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1000)
  return { app, win }
}

/** The main window defaults to 1100px wide; the overlay's base width is 220 (up to 440 at 2.0x scale) — clearly distinguishable. */
async function overlayVisible(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const overlay = BrowserWindow.getAllWindows().find((w) => w.getSize()[0] < 600)
    return overlay ? overlay.isVisible() : false
  })
}

;(async () => {
  ensureBundlePatched()

  console.log('\n=== M: invalid combo is rejected without registering anything ===')
  {
    const { app, win } = await launch(FOCUSED_ON_GAME, false)
    const result = await win.evaluate(() => window.api.keybinds.set('startPauseTimer', 'F9'))
    check('bare single key rejected', result, { ok: false, error: 'invalid_combo' })
    await app.close()
  }

  console.log('\n=== M: hotkey no-ops when nothing tracked is focused ===')
  {
    const { app, win } = await launch('', false)
    await win.evaluate(() => window.__gamutTest.triggerKeybind('startPauseTimer'))
    await win.waitForTimeout(300)
    check('timer still not running', readProfiles()['Focused Game'].activeSession, null)
    await app.close()
  }

  console.log("\n=== M: hotkey starts, then pauses, the focused+linked game's timer ===")
  console.log('=== N: screenshot hotkey saves a PNG, visible via screenshots.list ===')
  {
    const { app, win } = await launch(FOCUSED_ON_GAME, false)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('startPauseTimer'))
    await win.waitForTimeout(300)
    check('timer started', readProfiles()['Focused Game'].activeSession !== null, true)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('startPauseTimer'))
    await win.waitForTimeout(300)
    const paused = readProfiles()['Focused Game']
    check('timer paused', paused.activeSession, null)
    check('some time was recorded', paused.seconds > 0, true)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('saveScreenshot'))
    await win.waitForTimeout(500)
    const shotDir = path.join(DOCS, 'Gamut', 'Screenshots', 'Focused Game')
    const shots = fs.existsSync(shotDir) ? fs.readdirSync(shotDir) : []
    check('one screenshot file saved', shots.length, 1)
    check('it is a PNG', shots[0] && shots[0].endsWith('.png'), true)

    const listed = await win.evaluate((name) => window.api.screenshots.list(name), 'Focused Game')
    check('screenshots.list sees the same file', listed.length, 1)

    await app.close()
  }

  console.log('\n=== O: overlay window appears only while a linked game is focused and enabled ===')
  {
    const { app, win } = await launch(FOCUSED_ON_GAME, true)
    await win.waitForTimeout(2500) // overlayWindow polls every 2s
    check('overlay visible while focused+linked and enabled', await overlayVisible(app), true)

    await win.evaluate(() =>
      window.api.settings.update({ overlay: { enabled: false, corner: 'top-right', scale: 1, shadow: true } })
    )
    await win.waitForTimeout(300) // onSettingsChanged reacts immediately
    check('overlay hidden once disabled', await overlayVisible(app), false)

    await app.close()
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 3: Run the verification script**

Run: `node scripts/verify-keybinds-screenshots-overlay.cjs`
Expected: `ALL CHECKS PASSED`. If any check fails, read the failure's actual/expected values, find the root cause in the relevant task's source (do not weaken or delete the check), fix it, rebuild (`npm run build`), and re-run.

- [ ] **Step 4: Confirm the patch never reaches a real build**

Run: `npm run build` (a clean rebuild overwrites the patched bundle), then `grep -c GAMUT_TEST_APPDATA out/main/index.js`
Expected: `0` — proves the test-only patch doesn't survive a real build, same check `feedback-isolate-gamut-test-launches` documents.

- [ ] **Step 5: Run the full unit test suite and typecheck**

Run: `npm run test` and `npm run typecheck`
Expected: both pass — the full suite from Tasks 1–2 plus every existing test, and a clean typecheck across the whole feature.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-keybinds-screenshots-overlay.cjs
git commit -m "M/N/O: add end-to-end verification against the real packaged app"
```

---

## Self-Review Notes

- **Spec coverage:** M1 (Task 5's tab), M2 (Task 2's validation + Task 4's registration/defaults), N1 (Task 3's capture/folder + Task 7's gallery button/dialog), O1 (Task 8's window/settings + Task 9's renderer + Task 10's settings UI) — all covered. The "current game" concept (spec's core section) is Task 1, shared by all three.
- **Corrected mid-plan:** the spec originally gated "current game" on `timerEngine.isRunning()`; Task 1 implements the corrected rule (linked + OS-focused, independent of timer state) — see the design spec's updated "Core concept" section and Task 1's doc comment for why.
- **Type consistency checked:** `KeybindKind` is defined once (`ipcContract.ts`) and imported everywhere else (`keybindService.ts`, `keybinds.ipc.ts`, `dev.ipc.ts`, `KeybindsSettings.tsx`) rather than redeclared. `OverlayCorner` likewise defined once in `types.ts`. `ForegroundWindowInfo` defined once in `foregroundMatch.ts`, re-exported (not redeclared) from `foregroundWindow.ts`.
- **No placeholders:** every step has complete, real code; locale-key steps specify exact key/value content even where the precise line number depends on reading the file first (it's alphabetically sorted, so the insertion point is mechanical, not a judgment call left to the implementer).
