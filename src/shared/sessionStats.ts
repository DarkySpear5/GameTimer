import { MIN_SESSION_SECONDS } from './constants'

/**
 * One Play→Pause cycle. `startedAt` is a Date.now() epoch ms; `seconds` is
 * wall-clock elapsed. `short` marks a cycle below MIN_SESSION_SECONDS — kept
 * in the log (the data is real) but excluded from counts and averages.
 */
export interface SessionEntry {
  startedAt: number
  seconds: number
  short?: true
}

/**
 * Running totals over EVERY session a game has ever had, kept exact forever
 * in constant space.
 *
 * The session log used to be the source of truth and was kept unbounded, on
 * the reasoning that capping it would turn "average session" into "average of
 * recent sessions". Measurement showed what that actually cost: 40 games with
 * two years of history each is 80,000 entries, +47MB of process memory, and a
 * 3.3MB save file that the 5-second checkpoint re-serialises in full while any
 * timer is running.
 *
 * It also showed the reasoning was wrong. Every figure Gamut displays — count,
 * average, longest, first, last — is an aggregate. None of them needs the
 * individual entries. Keeping the totals here makes all of them exact for the
 * lifetime of the game while the log itself can safely be bounded.
 */
export interface SessionAggregate {
  /** Real sessions only; short ones are excluded, matching what's displayed. */
  count: number
  /** Sum of real sessions, so the average never has to be recomputed from entries. */
  totalSeconds: number
  longestSeconds: number
  /** From every session including short ones — you did open it, briefly. */
  firstPlayedAt: number | null
  lastPlayedAt: number | null
}

/**
 * A session that is running right now, written to disk so it survives the app
 * not getting to run its shutdown path.
 *
 * Without this, a session only ever reached sessionStats via pause(). A crash,
 * a power cut or a force-quit therefore lost the session ENTIRELY while its
 * elapsed time still landed in `seconds` via the 5s checkpoint — so a game
 * showed more total playtime than its sessions could account for, and "average
 * session" silently became "length of the last session that ended cleanly".
 *
 * `lastSeenAt` is refreshed by the same checkpoint that commits the seconds, so
 * recovery can only ever credit time that was already durably counted.
 */
export interface ActiveSession {
  startedAt: number
  lastSeenAt: number
}

/**
 * How many individual sessions are retained per game. Nothing displayed today
 * reads these — they exist so a future play-history graph has something to
 * draw. The aggregate above is what keeps the numbers honest.
 */
export const MAX_SESSION_LOG = 200

export interface SessionSummary {
  sessions: number
  /** Mean of real sessions. 0 when there are none, never NaN. */
  averageSeconds: number
  longestSeconds: number
  firstPlayedAt: number | null
  lastPlayedAt: number | null
}

export function emptyAggregate(): SessionAggregate {
  return { count: 0, totalSeconds: 0, longestSeconds: 0, firstPlayedAt: null, lastPlayedAt: null }
}

export function makeSessionEntry(startedAt: number, endedAt: number): SessionEntry {
  // Clamped at zero: a system clock adjustment mid-session could otherwise
  // write a negative duration into the log and corrupt every average forever.
  const seconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000))
  return seconds < MIN_SESSION_SECONDS ? { startedAt, seconds, short: true } : { startedAt, seconds }
}

/** Folds one session into the running totals. Pure — returns a new aggregate. */
export function addSession(agg: SessionAggregate, entry: SessionEntry): SessionAggregate {
  const next: SessionAggregate = {
    ...agg,
    firstPlayedAt:
      agg.firstPlayedAt === null ? entry.startedAt : Math.min(agg.firstPlayedAt, entry.startedAt),
    lastPlayedAt: agg.lastPlayedAt === null ? entry.startedAt : Math.max(agg.lastPlayedAt, entry.startedAt)
  }
  if (entry.short) return next
  return {
    ...next,
    count: agg.count + 1,
    totalSeconds: agg.totalSeconds + entry.seconds,
    longestSeconds: Math.max(agg.longestSeconds, entry.seconds)
  }
}

/** Builds an aggregate from a whole log — used once, to migrate existing saves. */
export function aggregateFrom(log: SessionEntry[]): SessionAggregate {
  return log.reduce(addSession, emptyAggregate())
}

/** Keeps only the most recent entries; the aggregate already holds the rest. */
export function trimSessionLog(log: SessionEntry[]): SessionEntry[] {
  return log.length <= MAX_SESSION_LOG ? log : log.slice(log.length - MAX_SESSION_LOG)
}

/**
 * Whether there's a clean, trustworthy idle figure for this profile at all.
 *
 * Both baseline fields are captured TOGETHER the moment idle tracking last
 * (re)started (`gameWatcher.ts`'s `creditOpenSeconds`) — either being null
 * means no clean split exists yet, and the UI must say so rather than
 * silently showing a number for it. A profile can have real `openSeconds`
 * already (old data from before this pairing existed) with no baseline at
 * all — that is exactly the case that must NOT render a figure; see
 * `idleSecondsFor`'s own doc comment for what going wrong here looked like.
 */
export function hasIdleBaseline(profile: {
  secondsAtOpenTrackingStart: number | null
  openSecondsAtOpenTrackingStart: number | null
}): boolean {
  return profile.secondsAtOpenTrackingStart != null && profile.openSecondsAtOpenTrackingStart != null
}

/**
 * Idle time: the game was open but Gamut wasn't counting it as active play.
 *
 * NOT `openSeconds - seconds`, and NOT `openSeconds - (seconds since a
 * single seconds-only baseline)` either — both were tried and both broke.
 * `openSeconds` only ever covers launches Gamut actually watched, which for
 * almost every profile starts well after `seconds` already had real history
 * behind it (a different Gamut version, or simply before watching was ever
 * turned on).
 *
 * Comparing against the raw `seconds` total dwarfs `openSeconds` under all
 * that pre-tracking history and clamps idle to 0 forever. Comparing against
 * only a `seconds` baseline (this function's first version) is just as
 * wrong the other way: with no matching baseline on the `openSeconds` side,
 * ALL of it — including years of already-active, already-counted play —
 * reads as idle. Reported live: 9:25:18 played, 13:44:10 open, shown as
 * 13:44:10 (100%) idle. Flatly false, and provably so to the one person who
 * knows how much of that time he was actually at the keyboard.
 *
 * The fix is a baseline on BOTH sides, captured in the same instant
 * (`secondsAtOpenTrackingStart` / `openSecondsAtOpenTrackingStart`): idle is
 * how much `openSeconds` grew since that moment minus how much `seconds`
 * grew since it. Old, un-split history on either side is excluded
 * entirely — not assumed to be idle, not assumed to be active — because
 * there is no way to recover which it was. Returns 0 whenever
 * `hasIdleBaseline` is false; callers MUST check that separately before
 * displaying this as a real figure rather than "no data yet".
 */
export function idleSecondsFor(profile: {
  seconds: number
  openSeconds: number
  secondsAtOpenTrackingStart: number | null
  openSecondsAtOpenTrackingStart: number | null
}): number {
  if (!hasIdleBaseline(profile)) return 0
  const activeSinceBaseline = profile.seconds - profile.secondsAtOpenTrackingStart!
  const openSinceBaseline = profile.openSeconds - profile.openSecondsAtOpenTrackingStart!
  return Math.max(0, openSinceBaseline - activeSinceBaseline)
}

/** What the UI shows. Derived, so it can never disagree with the aggregate. */
export function summaryFrom(agg: SessionAggregate): SessionSummary {
  return {
    sessions: agg.count,
    averageSeconds: agg.count === 0 ? 0 : Math.round(agg.totalSeconds / agg.count),
    longestSeconds: agg.longestSeconds,
    firstPlayedAt: agg.firstPlayedAt,
    lastPlayedAt: agg.lastPlayedAt
  }
}
