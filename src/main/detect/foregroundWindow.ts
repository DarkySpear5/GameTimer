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
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
# A plain, unmanifested PowerShell process is only SYSTEM-DPI-aware, not
# PER-MONITOR-aware: Windows virtualizes GetWindowRect's coordinates using a
# single scale factor (the primary monitor's) applied everywhere, instead of
# each monitor's own. That's invisible on a single-monitor or same-scale
# multi-monitor setup, and produces a real, systematic X/Y error the moment a
# window sits on a secondary monitor with a DIFFERENT scale factor than the
# primary (confirmed live: overlay position drifted specifically on a
# two-monitor 150%/100% setup, worse on the secondary monitor). -4 is
# DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 — asking Windows for the actual
# per-monitor-correct coordinates instead.
[GamutWin32]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
$hwnd = [GamutWin32]::GetForegroundWindow()
$procId = 0
[GamutWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
$sb = New-Object System.Text.StringBuilder 256
[GamutWin32]::GetWindowText($hwnd, $sb, 256) | Out-Null
$rect = New-Object GamutWin32+RECT
[GamutWin32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
if (-not $proc) { exit }
# $proc.Path comes back empty for a process running more elevated than this
# unmanifested PowerShell — an anti-cheat-protected game under GameGuard
# (Vindictus, found live), for example. ProcessName is still readable across
# that boundary, so it's included as a fallback identifier rather than
# exiting outright the way this used to when Path alone was missing.
[PSCustomObject]@{
  ExePath = $proc.Path
  ProcessName = $proc.ProcessName
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
 * this project already hit real packaging fragility from one native/ESM
 * dependency (@noble/hashes breaking electron-builder's blockmap step), and
 * a native addon or ESM-only npm package for this would repeat that risk.
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
 * `gameWatcher` poll or the Gamut timer's own state — gating on
 * `timerEngine.isRunning()` would make a start/pause hotkey only ever able
 * to pause, never start.
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
    .map((p) => ({ name: p.name, installDir: p.installDir, exePath: p.exePath, launchUri: p.launchUri }))
  return matchForegroundToRunning(info, candidates)
}
