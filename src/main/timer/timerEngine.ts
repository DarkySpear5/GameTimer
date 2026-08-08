import { dataStore } from '../store/dataStore'
import { writeStatusLog } from '../statusLog/writeStatusLog'
import { backupService } from '../backup/backupService'
import { todayDateString } from '../util/date'
import { UI_TICK_MS, CHECKPOINT_MS, STATUS_LOG_MS } from '@shared/constants'
import { addSession, makeSessionEntry, trimSessionLog } from '@shared/sessionStats'
import type { TimerTickPayload } from '@shared/ipcContract'

type TickListener = (payload: TimerTickPayload) => void

/**
 * Any number of games can run concurrently — a profile is "running" iff it's
 * a key in activeTimers, mapping name -> the Date.now() ms timestamp Play was
 * last pressed (or last checkpointed). Mirrors v1's self.active_timers dict
 * and _tick()/_checkpoint_all()/_checkpoint_one() exactly, just in ms instead
 * of float seconds internally (converted to seconds wherever it touches
 * `profile.seconds`, which stays in seconds to match the persisted format).
 */
class TimerEngine {
  private activeTimers = new Map<string, number>()
  /**
   * name -> the Date.now() when Play was pressed. Deliberately separate from
   * activeTimers: that map's values get rewritten every 5s by checkpointAll()
   * so elapsed time can be committed without stopping the clock, which would
   * silently restart the session on every checkpoint if the two shared a map.
   */
  private sessionStarts = new Map<string, number>()
  private lastCheckpoint = Date.now()
  private lastStatusLog = Date.now()
  private lastBackupDay = ''
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<TickListener>()

  isRunning(name: string): boolean {
    return this.activeTimers.has(name)
  }

  runningNames(): string[] {
    return [...this.activeTimers.keys()]
  }

  start(name: string): void {
    const profile = dataStore.get().profiles[name]
    if (!profile) return
    if (profile.status === 'dropped' || profile.status === 'on_hold') {
      // Pressing Play is the natural "I'm actually playing this again"
      // signal — Completed survives replay, but a stale Dropped/On Hold
      // label doesn't (matches v1's _start_profile exactly). The
      // statusAt/statusSeconds snapshot deliberately stays, matching
      // profileService.setStatus since v2.1.12 — that record is only ever
      // destroyed by the explicit Clear action, never as a side effect of
      // something else. This was the last path that still wiped it.
      profile.status = 'in_progress'
    }
    this.activeTimers.set(name, Date.now())
    this.sessionStarts.set(name, Date.now())
    profile.lastPlayed = Date.now()
    if (!profile.startedDate) {
      profile.startedDate = todayDateString()
    }
    void dataStore.safeSave()
  }

  pause(name: string): void {
    const tickStart = this.activeTimers.get(name)
    if (tickStart === undefined) return
    this.activeTimers.delete(name)
    const sessionStart = this.sessionStarts.get(name)
    this.sessionStarts.delete(name)
    try {
      const profile = dataStore.get().profiles[name]
      if (profile) {
        profile.seconds += (Date.now() - tickStart) / 1000
        if (sessionStart !== undefined) {
          const entry = makeSessionEntry(sessionStart, Date.now())
          // The aggregate is the source of truth and is updated first; the log
          // is a bounded tail kept only for a future history graph.
          profile.sessionStats = addSession(profile.sessionStats, entry)
          profile.sessionLog.push(entry)
          profile.sessionLog = trimSessionLog(profile.sessionLog)
        }
      }
      void dataStore.save()
      void writeStatusLog()
    } catch {
      // never let a save/log failure block pausing or closing
    }
  }

  /** Commits a running profile's elapsed time without stopping it — used before Duplicate/Export read `seconds`. */
  checkpointOne(name: string): void {
    const tickStart = this.activeTimers.get(name)
    if (tickStart === undefined) return
    const now = Date.now()
    const profile = dataStore.get().profiles[name]
    if (profile) profile.seconds += (now - tickStart) / 1000
    this.activeTimers.set(name, now)
  }

  private checkpointAll(): void {
    const now = Date.now()
    let touched = false
    for (const name of [...this.activeTimers.keys()]) {
      const profile = dataStore.get().profiles[name]
      if (!profile) {
        this.activeTimers.delete(name)
        continue
      }
      const start = this.activeTimers.get(name)!
      profile.seconds += (now - start) / 1000
      this.activeTimers.set(name, now)
      touched = true
    }
    if (touched) void dataStore.save()
  }

  /** Preserves a running timer's live tick_start across a rename instead of pausing/restarting it. */
  renameActive(oldName: string, newName: string): void {
    const start = this.activeTimers.get(oldName)
    if (start !== undefined) {
      this.activeTimers.delete(oldName)
      this.activeTimers.set(newName, start)
    }
    // Carried across too, or renaming mid-session silently discards it.
    const sessionStart = this.sessionStarts.get(oldName)
    if (sessionStart !== undefined) {
      this.sessionStarts.delete(oldName)
      this.sessionStarts.set(newName, sessionStart)
    }
  }

  /** Drops a profile's timer without committing — used right before it's deleted. */
  stopActive(name: string): void {
    this.activeTimers.delete(name)
    this.sessionStarts.delete(name)
  }

  /** Restarts tick_start without corrupting a running session — used by Reset Time. */
  restartActiveIfRunning(name: string): void {
    if (this.activeTimers.has(name)) this.activeTimers.set(name, Date.now())
  }

  onTick(listener: TickListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  startLoop(): void {
    if (this.intervalHandle) return
    this.intervalHandle = setInterval(() => this.tick(), UI_TICK_MS)
  }

  stopLoop(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle)
    this.intervalHandle = null
  }

  /** Called on quit — commits every running timer before the app exits. */
  pauseAll(): void {
    for (const name of [...this.activeTimers.keys()]) this.pause(name)
  }

  private tick(): void {
    this.emitTick()

    const now = Date.now()
    if (this.activeTimers.size > 0 && now - this.lastCheckpoint >= CHECKPOINT_MS) {
      this.checkpointAll()
      this.lastCheckpoint = now
    }
    if (this.activeTimers.size > 0 && now - this.lastStatusLog >= STATUS_LOG_MS) {
      void writeStatusLog()
      this.lastStatusLog = now
    }
    // Daily backup runs regardless of whether anything is running.
    const today = todayDateString()
    if (today !== this.lastBackupDay) {
      void backupService.runDailyBackup()
      this.lastBackupDay = today
    }
  }

  private emitTick(): void {
    if (this.listeners.size === 0) return
    const now = Date.now()
    const data = dataStore.get()
    const running: Record<string, number> = {}
    for (const name of this.activeTimers.keys()) {
      const profile = data.profiles[name]
      if (!profile) continue
      const start = this.activeTimers.get(name)!
      running[name] = profile.seconds + (now - start) / 1000
    }
    for (const listener of this.listeners) listener({ running })
  }
}

export const timerEngine = new TimerEngine()
