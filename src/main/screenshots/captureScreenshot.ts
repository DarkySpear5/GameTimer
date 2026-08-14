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
