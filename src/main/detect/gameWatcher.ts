import { matchingPaths, isElevatedNameMatch } from './watchMatch'
import { listRunningProcesses } from './processes'
import { dataStore } from '../store/dataStore'
import { timerEngine } from '../timer/timerEngine'
import type { Profile } from '@shared/types'

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
 * Names currently open ONLY via the elevated name-only fallback (Nexon/
 * Battle.net/EA anti-cheat, found live on Vindictus) — never via a
 * resolvable path. Gamut can see these processes exist but Windows blocks it
 * from ever reading enough about an elevated one to kill it, so Stop can't
 * act on them (see gameLauncher.ts's stopGame) — the renderer disables the
 * button for these instead of offering one that would silently fail.
 */
const elevatedOpen = new Set<string>()

/**
 * Games we launched ourselves, so the next poll adopts them as already-running
 * instead of counting the launch a second time.
 */
const selfLaunched = new Set<string>()

let handle: ReturnType<typeof setInterval> | null = null

/** Fired with the full set of currently-open game names whenever a poll changes it — the Launch/Stop button listens for this. */
const changeListeners = new Set<(names: string[]) => void>()

/**
 * Fired with whichever profiles this module itself just mutated (auto-pause,
 * openSeconds accrual, launch count) — the renderer's own profile cache has
 * no other way to learn about a change that originated here rather than from
 * one of its own IPC calls. Separate from `changeListeners`: that one only
 * ever carries names (open/closed), never the profile DATA a change like
 * `seconds` or `openSeconds` actually needs.
 */
const profileChangeListeners = new Set<(profiles: Profile[]) => void>()

function broadcastProfiles(profiles: Profile[]): void {
  if (profiles.length === 0) return
  for (const cb of profileChangeListeners) cb(profiles)
}

/**
 * Splits one process listing into the two shapes isGameRunning needs: paths
 * (the common case) and bare names for whatever this app couldn't read a
 * path for at all — an elevated, anti-cheat-protected process (Vindictus
 * under GameGuard, found live) never has a path here, only a name. One
 * listRunningProcesses() call for both, not two — this runs on every poll.
 */
async function runningProcessSets(): Promise<{ paths: Set<string>; namesNoPath: Set<string> }> {
  const procs = await listRunningProcesses()
  const paths = new Set<string>()
  const namesNoPath = new Set<string>()
  for (const p of procs) {
    if (p.path) paths.add(p.path)
    else namesNoPath.add(p.name)
  }
  return { paths, namesNoPath }
}

/**
 * Credits `deltaSeconds` to `openSeconds`, baselining `secondsAtOpenTrackingStart`
 * against the profile's CURRENT `seconds` the first time this ever runs for
 * it — see that field's own doc comment in types.ts for why comparing
 * `openSeconds` against the profile's all-time `seconds` (which usually
 * already has real history behind it) is wrong, and comparing it against
 * only the `seconds` accrued since is the fix.
 */
function creditOpenSeconds(profile: Profile, deltaSeconds: number): void {
  // Both null or both set, always captured together — see their shared doc
  // comment in types.ts for why splitting them (or defaulting a missing one
  // to "assume zero since baseline") is exactly the bug this replaced: it
  // dumped any OLD, un-split openSeconds straight into the idle side,
  // reading as 100% idle next to real hours of active play. Either being
  // null re-baselines BOTH from their current totals — which for old
  // openSeconds means writing off history whose split is genuinely unknown,
  // rather than guessing which side it belongs to.
  if (profile.secondsAtOpenTrackingStart == null || profile.openSecondsAtOpenTrackingStart == null) {
    profile.secondsAtOpenTrackingStart = profile.seconds
    profile.openSecondsAtOpenTrackingStart = profile.openSeconds
  }
  profile.openSeconds += deltaSeconds
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

  const { paths: running, namesNoPath: runningNamesNoPath } = await runningProcessSets()
  let touched = false
  const changedProfiles: Profile[] = []

  for (const profile of linked) {
    const pathHit = matchingPaths(profile, running).length > 0
    const nameHit = !pathHit && isElevatedNameMatch(profile, runningNamesNoPath)
    const isRunning = pathHit || nameHit
    const wasOpen = open.has(profile.name)

    if (isRunning) {
      if (nameHit) elevatedOpen.add(profile.name)
      else elevatedOpen.delete(profile.name)
    } else {
      elevatedOpen.delete(profile.name)
    }

    if (isRunning && !wasOpen) {
      open.set(profile.name, Date.now())
      // A launch we performed ourselves was already counted at launch time —
      // but the open-set itself still changed just now, either way, and the
      // Launch/Stop button needs to hear about THAT regardless of who gets
      // credited with the launch count. This used to only flip `touched` in
      // the else branch, so a game Gamut itself launched (the common case —
      // noteLaunched() already added it to selfLaunched) never told the
      // button it had opened, even though timerEngine.start() below ran fine
      // and made the Play/Pause button look right.
      touched = true
      if (selfLaunched.has(profile.name)) {
        selfLaunched.delete(profile.name)
      } else {
        profile.launches += 1
      }
      changedProfiles.push(profile)
      if (autoStartEnabled(profile.name) && !timerEngine.isRunning(profile.name)) {
        timerEngine.start(profile.name)
      }
    } else if (!isRunning && wasOpen) {
      const startedAt = open.get(profile.name)!
      open.delete(profile.name)
      creditOpenSeconds(profile, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
      touched = true
      if (autoStartEnabled(profile.name) && timerEngine.isRunning(profile.name)) {
        timerEngine.pause(profile.name)
      }
      changedProfiles.push(profile)
    }
  }

  if (touched) {
    await dataStore.safeSave()
    const names = [...open.keys()]
    for (const cb of changeListeners) cb(names)
    broadcastProfiles(changedProfiles)
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

  /** Names of every open game Stop can't act on — see elevatedOpen's doc comment above. */
  unstoppableNames(): string[] {
    return [...elevatedOpen]
  },

  /** Called right after Gamut kills a game's process itself, so the UI flips to "Launch" without waiting for the next poll. */
  noteClosed(name: string): void {
    const startedAt = open.get(name)
    if (startedAt === undefined) return
    open.delete(name)
    elevatedOpen.delete(name)
    const profile = dataStore.get().profiles[name]
    if (profile) {
      creditOpenSeconds(profile, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
      void dataStore.safeSave()
    }
    // The player just confirmed they're done — stop the clock regardless of
    // the auto-start setting, same as closing the app's own window would.
    if (timerEngine.isRunning(name)) timerEngine.pause(name)
    const names = this.openNames()
    for (const cb of changeListeners) cb(names)
    // Same staleness gap as poll()'s auto-pause branch: pausing just updated
    // profile.seconds, and nothing else in this call path refreshes the
    // renderer's own cached copy of it.
    if (profile) broadcastProfiles([profile])
  },

  /** Subscribes to the open-games list changing. Returns an unsubscribe function. */
  onChange(cb: (names: string[]) => void): () => void {
    changeListeners.add(cb)
    return () => changeListeners.delete(cb)
  },

  /** Subscribes to profiles this module mutated itself (auto-pause, launch/openSeconds accrual) — see profileChangeListeners' doc comment. */
  onProfilesChanged(cb: (profiles: Profile[]) => void): () => void {
    profileChangeListeners.add(cb)
    return () => profileChangeListeners.delete(cb)
  },

  stop(): void {
    if (handle) clearInterval(handle)
    handle = null
  }
}
