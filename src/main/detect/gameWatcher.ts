import { isGameRunning } from './watchMatch'
import { listRunningProcesses } from './processes'
import { dataStore } from '../store/dataStore'
import { timerEngine } from '../timer/timerEngine'

/**
 * How often the running-process list is re-read. Ten seconds is a deliberate
 * compromise: a launch shows up quickly enough to feel immediate, while the
 * cost stays negligible — the app was memory-optimised in v2.1.10 and this
 * must not undo that.
 */
const POLL_MS = 10_000

/** name -> Date.now() when the process was first seen (or when we launched it). */
const open = new Map<string, number>()

/**
 * Games we launched ourselves, so the next poll adopts them as already-running
 * instead of counting the launch a second time.
 */
const selfLaunched = new Set<string>()

let handle: ReturnType<typeof setInterval> | null = null

/** Fired with the full set of currently-open game names whenever a poll changes it — the Launch/Stop button listens for this. */
const changeListeners = new Set<(names: string[]) => void>()

/** Just the executable paths — no window titles, no icons. Polled, so it must stay cheap. */
async function runningExePaths(): Promise<Set<string>> {
  return new Set((await listRunningProcesses()).map((p) => p.path))
}

function autoStartEnabled(name: string): boolean {
  const data = dataStore.get()
  const profile = data.profiles[name]
  if (!profile) return false
  return profile.autoStartTimer ?? data.settings.autoStartTimer
}

async function poll(): Promise<void> {
  const data = dataStore.get()
  const linked = Object.values(data.profiles).filter((p) => p.exePath || p.installDir)
  if (linked.length === 0) return

  const running = await runningExePaths()
  let touched = false

  for (const profile of linked) {
    const isRunning = isGameRunning(profile, running)
    const wasOpen = open.has(profile.name)

    if (isRunning && !wasOpen) {
      open.set(profile.name, Date.now())
      // A launch we performed ourselves was already counted at launch time.
      if (selfLaunched.has(profile.name)) {
        selfLaunched.delete(profile.name)
      } else {
        profile.launches += 1
        touched = true
      }
      if (autoStartEnabled(profile.name) && !timerEngine.isRunning(profile.name)) {
        timerEngine.start(profile.name)
      }
    } else if (!isRunning && wasOpen) {
      const startedAt = open.get(profile.name)!
      open.delete(profile.name)
      profile.openSeconds += Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      touched = true
      if (autoStartEnabled(profile.name) && timerEngine.isRunning(profile.name)) {
        timerEngine.pause(profile.name)
      }
    }
  }

  if (touched) {
    await dataStore.safeSave()
    const names = [...open.keys()]
    for (const cb of changeListeners) cb(names)
  }
}

/**
 * Runs when the user opted into background watching, or while a game Gamut
 * launched itself is still open — the latter is how launch counts and open
 * time stay exact for someone who never turns polling on.
 */
function shouldRun(): boolean {
  return dataStore.get().settings.watchForGames || open.size > 0 || selfLaunched.size > 0
}

export const gameWatcher = {
  /** Re-evaluates whether the loop should be running. Safe to call repeatedly. */
  sync(): void {
    if (shouldRun() && !handle) {
      handle = setInterval(() => void poll().then(() => gameWatcher.sync()), POLL_MS)
      void poll()
    } else if (!shouldRun() && handle) {
      clearInterval(handle)
      handle = null
    }
  },

  /**
   * Called right after Gamut launches a game. The launch is counted here, at
   * the exact moment it happened, rather than waiting for a poll to notice —
   * and marking it suppresses the duplicate count that poll would otherwise
   * add when it sees the process appear.
   */
  noteLaunched(name: string): void {
    selfLaunched.add(name)
    this.sync()
  },

  /** Names of every game whose process is currently seen running, as of the last poll. */
  openNames(): string[] {
    return [...open.keys()]
  },

  /** Called right after Gamut kills a game's process itself, so the UI flips to "Launch" without waiting for the next poll. */
  noteClosed(name: string): void {
    const startedAt = open.get(name)
    if (startedAt === undefined) return
    open.delete(name)
    const profile = dataStore.get().profiles[name]
    if (profile) {
      profile.openSeconds += Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      void dataStore.safeSave()
    }
    // The player just confirmed they're done — stop the clock regardless of
    // the auto-start setting, same as closing the app's own window would.
    if (timerEngine.isRunning(name)) timerEngine.pause(name)
    const names = this.openNames()
    for (const cb of changeListeners) cb(names)
  },

  /** Subscribes to the open-games list changing. Returns an unsubscribe function. */
  onChange(cb: (names: string[]) => void): () => void {
    changeListeners.add(cb)
    return () => changeListeners.delete(cb)
  },

  stop(): void {
    if (handle) clearInterval(handle)
    handle = null
  }
}
