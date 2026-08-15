import { dataStore } from '../store/dataStore'
import { writeStatusLog } from '../statusLog/writeStatusLog'
import { backupService } from '../backup/backupService'
import { todayDateString } from '../util/date'
import { UI_TICK_MS, CHECKPOINT_MS, STATUS_LOG_MS } from '@shared/constants'
import { addSession, makeSessionEntry, trimSessionLog } from '@shared/sessionStats'
import { creditSubCategory } from '@shared/subCategories'
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
  /**
   * name -> profile.seconds at the exact moment this session started.
   * Deliberately separate from sessionStarts (a wall-clock timestamp): this is
   * a SECONDS snapshot, used only to compute "how much has the main total
   * grown since this session began" whenever the sub-category prompt is
   * eventually answered — which can be well after pause() has already run and
   * cleared activeSession. Not persisted: if the app closes before the prompt
   * is answered, that's the same outcome as answering None (see the design
   * spec), so there's nothing to recover.
   */
  private pendingCategoryStart = new Map<string, number>()
  /**
   * name -> categoryId, once assignSubCategorySession resolves the pending
   * prompt for a session that's still running. From that point on, every
   * checkpoint/pause credits the SAME delta to this category as it commits
   * to profile.seconds — a session that's been categorized keeps crediting
   * that category for the rest of its length, not just the elapsed-at-
   * answer-time snapshot. Cleared on pause/stop/start: each session starts
   * unassigned, matching "ask every time" a timer starts.
   */
  private activeCategoryAssignment = new Map<string, string>()
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
    if (profile.status === 'not_started' || profile.status === 'dropped' || profile.status === 'on_hold') {
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
    this.pendingCategoryStart.set(name, profile.seconds)
    this.activeCategoryAssignment.delete(name)
    // Written to disk so the session survives a crash — see recoverSessions.
    profile.activeSession = { startedAt: Date.now(), lastSeenAt: Date.now() }
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
    const categoryId = this.activeCategoryAssignment.get(name)
    this.activeCategoryAssignment.delete(name)
    try {
      const profile = dataStore.get().profiles[name]
      if (profile) {
        const delta = (Date.now() - tickStart) / 1000
        profile.seconds += delta
        if (categoryId) profile.subCategories = creditSubCategory(profile.subCategories, categoryId, delta)
        // The session is ending cleanly, so the crash marker has done its job.
        profile.activeSession = null
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
    if (profile) {
      const delta = (now - tickStart) / 1000
      profile.seconds += delta
      const categoryId = this.activeCategoryAssignment.get(name)
      if (categoryId) profile.subCategories = creditSubCategory(profile.subCategories, categoryId, delta)
      if (profile.activeSession) profile.activeSession.lastSeenAt = now
    }
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
      const delta = (now - start) / 1000
      profile.seconds += delta
      const categoryId = this.activeCategoryAssignment.get(name)
      if (categoryId) profile.subCategories = creditSubCategory(profile.subCategories, categoryId, delta)
      this.activeTimers.set(name, now)
      // Advanced in lockstep with the seconds just committed, so recovery can
      // never credit time that wasn't already durably saved.
      if (profile.activeSession) profile.activeSession.lastSeenAt = now
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
    // Same reasoning: a pending sub-category prompt for this session must
    // still resolve correctly under the new name.
    const categoryStart = this.pendingCategoryStart.get(oldName)
    if (categoryStart !== undefined) {
      this.pendingCategoryStart.delete(oldName)
      this.pendingCategoryStart.set(newName, categoryStart)
    }
    const categoryId = this.activeCategoryAssignment.get(oldName)
    if (categoryId !== undefined) {
      this.activeCategoryAssignment.delete(oldName)
      this.activeCategoryAssignment.set(newName, categoryId)
    }
  }

  getPendingCategoryStart(name: string): number | undefined {
    return this.pendingCategoryStart.get(name)
  }

  clearPendingCategoryStart(name: string): void {
    this.pendingCategoryStart.delete(name)
  }

  /** Keeps crediting `categoryId` on every future checkpoint/pause of this session — see the field comment above. A no-op if the session already ended. */
  setActiveCategoryAssignment(name: string, categoryId: string): void {
    if (this.activeTimers.has(name)) this.activeCategoryAssignment.set(name, categoryId)
  }

  /** Drops a profile's timer without committing — used right before it's deleted. */
  stopActive(name: string): void {
    this.activeTimers.delete(name)
    this.sessionStarts.delete(name)
    this.pendingCategoryStart.delete(name)
    this.activeCategoryAssignment.delete(name)
    const profile = dataStore.get().profiles[name]
    if (profile) profile.activeSession = null
  }

  /**
   * Restarts a running timer from zero — used by Reset Time.
   *
   * The session in progress restarts too. Carrying the old session start
   * across a reset would end up writing a session longer than the playtime the
   * reset just cleared, which is the same class of "the numbers don't add up"
   * bug the reset was meant to fix.
   */
  restartActiveIfRunning(name: string): void {
    if (!this.activeTimers.has(name)) return
    const now = Date.now()
    this.activeTimers.set(name, now)
    this.sessionStarts.set(name, now)
    const profile = dataStore.get().profiles[name]
    if (profile) {
      profile.activeSession = { startedAt: now, lastSeenAt: now }
      // Reset Time already zeroed profile.seconds — re-snapshot from that new
      // baseline, or a still-pending sub-category prompt would compute a
      // negative delta against the pre-reset total once answered.
      this.pendingCategoryStart.set(name, profile.seconds)
    }
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
