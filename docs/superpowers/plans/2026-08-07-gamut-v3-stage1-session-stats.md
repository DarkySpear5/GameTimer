# Gamut v3 Stage 1 — Session Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record how many times the user actually sat down with each game and for how long, and surface it in a right-click "More info" window — without touching process detection, the network, or the Data tab's existing table.

**Architecture:** A session is one Play→Pause cycle, already fully observable inside `timerEngine`. The engine gains a parallel `sessionStarts` map (separate from `activeTimers`, because checkpoints reset the tick clock every 5s but must not end a session) and appends a `SessionEntry` to the profile on pause. All aggregation lives in one pure module, `src/shared/sessionStats.ts`, so it can be unit-tested with no Electron, no dataStore, and no UI. The renderer reads the log through the existing `getInitialData`/`profiles.list` paths — no new state store.

**Tech Stack:** Electron 37, TypeScript, React 19, Zustand, zod 4, i18next (10 locales), Vitest (added by Task 1), Playwright (`playwright-core`, existing practice).

## Global Constraints

- **Branch: `dev`.** Never commit stage 1 work to `main`. `main` is the public release line.
- **Accuracy is the product.** Tracked time (Play→Pause) is the only playtime shown. Never derive a headline number from process uptime. See the spec's Metro Exodus case: 19h real vs 50h on Steam.
- **`seconds` and `statusSeconds` keep their existing meaning.** No migration may alter them.
- **v2 save files must load unchanged.** Every new field gets a zod `.catch()` default, matching the existing "never reject a partial file" contract in `src/main/store/schema.ts`.
- **A session under 60 seconds is recorded but not counted** toward the session total or the average. Constant: `MIN_SESSION_SECONDS = 60`.
- **`sessionLog` is unbounded.** Do not add a cap; the spec rejected one explicitly.
- **All user-facing strings go through i18next in all 10 locales** (`de es fr it ja ko pt ru zh` plus `en`). No hardcoded English in components.
- **No new runtime dependencies.** Vitest is `devDependencies` only.
- **Node 18.20.8** is the installed runtime — pin Vitest to `^2.1.9`, which supports it. Newer majors require Node 20+.
- Run `npm run typecheck` before every commit. It must pass clean.

---

### Task 1: Vitest, and the pure session-stats module

Everything numeric in this stage lives here. Keeping it pure — no Electron, no dataStore, no React — is what makes it testable at all; the rest of the stage is wiring.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/shared/sessionStats.ts`
- Create: `src/shared/sessionStats.test.ts`
- Modify: `package.json` (add `test` script + `vitest` devDependency)
- Modify: `src/shared/constants.ts` (add `MIN_SESSION_SECONDS`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface SessionEntry { startedAt: number; seconds: number; short?: true }`
  - `function makeSessionEntry(startedAt: number, endedAt: number): SessionEntry`
  - `interface SessionSummary { sessions: number; averageSeconds: number; longestSeconds: number; firstPlayedAt: number | null; lastPlayedAt: number | null }`
  - `function summarizeSessions(log: SessionEntry[]): SessionSummary`
  - `const MIN_SESSION_SECONDS = 60` (from `@shared/constants`)

- [ ] **Step 1: Add Vitest and its config**

In `package.json`, add one line to `devDependencies`. The list is alphabetical, so `vitest` goes last, after `"vite": "^7.0.0"` — remember to add the comma to the `vite` line above it:

```json
    "vite": "^7.0.0",
    "vitest": "^2.1.9"
```

And add one line to `scripts`, after `"typecheck"`:

```json
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "test": "vitest run",
```

Create `vitest.config.ts`:

```ts
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * Separate from electron.vite.config.ts on purpose — that one builds three
 * Electron bundles and knows nothing about running tests. Only pure modules
 * are unit-tested here (anything importing `electron` needs the real runtime
 * and is covered by the Playwright pass instead), so this config is
 * deliberately minimal.
 */
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  define: {
    // src/shared/channel.ts reads this build-time define; anything that
    // transitively imports it would throw ReferenceError without it.
    __GAMUT_CHANNEL__: '"stable"'
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
```

Run `npm install`.

- [ ] **Step 2: Add the constant**

In `src/shared/constants.ts`, next to the other timing constants (`UI_TICK_MS`, `CHECKPOINT_MS`, `STATUS_LOG_MS`):

```ts
/**
 * A Play→Pause cycle shorter than this is still written to the session log,
 * but is excluded from the session count and the average. Pressing Play by
 * mistake should not inflate "times played" or drag the average down — and
 * silently discarding the entry instead would throw away real data.
 */
export const MIN_SESSION_SECONDS = 60
```

- [ ] **Step 3: Write the failing tests**

Create `src/shared/sessionStats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeSessionEntry, summarizeSessions } from './sessionStats'

const HOUR = 3_600_000

describe('makeSessionEntry', () => {
  it('records elapsed wall-clock seconds', () => {
    expect(makeSessionEntry(1000, 1000 + 90_000)).toEqual({ startedAt: 1000, seconds: 90 })
  })

  it('flags a sub-60s session as short', () => {
    expect(makeSessionEntry(1000, 1000 + 30_000)).toEqual({ startedAt: 1000, seconds: 30, short: true })
  })

  it('treats exactly 60s as a real session', () => {
    expect(makeSessionEntry(1000, 1000 + 60_000).short).toBeUndefined()
  })

  it('never produces negative seconds if the clock jumps backwards', () => {
    expect(makeSessionEntry(5000, 1000).seconds).toBe(0)
  })
})

describe('summarizeSessions', () => {
  it('returns zeroes for an empty log', () => {
    expect(summarizeSessions([])).toEqual({
      sessions: 0,
      averageSeconds: 0,
      longestSeconds: 0,
      firstPlayedAt: null,
      lastPlayedAt: null
    })
  })

  it('counts and averages only real sessions', () => {
    const log = [
      { startedAt: HOUR, seconds: 100 },
      { startedAt: 2 * HOUR, seconds: 300 },
      { startedAt: 3 * HOUR, seconds: 20, short: true as const }
    ]
    const s = summarizeSessions(log)
    expect(s.sessions).toBe(2)
    expect(s.averageSeconds).toBe(200)
    expect(s.longestSeconds).toBe(300)
  })

  it('reports zero average rather than dividing by zero when every session was short', () => {
    const s = summarizeSessions([{ startedAt: HOUR, seconds: 5, short: true as const }])
    expect(s.sessions).toBe(0)
    expect(s.averageSeconds).toBe(0)
    expect(s.longestSeconds).toBe(0)
  })

  it('still reports first/last played from short sessions', () => {
    const s = summarizeSessions([{ startedAt: HOUR, seconds: 5, short: true as const }])
    expect(s.firstPlayedAt).toBe(HOUR)
    expect(s.lastPlayedAt).toBe(HOUR)
  })

  it('finds first and last regardless of log order', () => {
    const s = summarizeSessions([
      { startedAt: 3 * HOUR, seconds: 100 },
      { startedAt: 1 * HOUR, seconds: 100 },
      { startedAt: 2 * HOUR, seconds: 100 }
    ])
    expect(s.firstPlayedAt).toBe(1 * HOUR)
    expect(s.lastPlayedAt).toBe(3 * HOUR)
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./sessionStats"`.

- [ ] **Step 5: Write the implementation**

Create `src/shared/sessionStats.ts`:

```ts
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

export interface SessionSummary {
  /** Real sessions only — short ones are excluded. */
  sessions: number
  /** Mean of real sessions. 0 when there are none, never NaN. */
  averageSeconds: number
  longestSeconds: number
  /** From the whole log including short sessions — you did open it, briefly. */
  firstPlayedAt: number | null
  lastPlayedAt: number | null
}

export function makeSessionEntry(startedAt: number, endedAt: number): SessionEntry {
  // Clamped at zero: a system clock adjustment mid-session could otherwise
  // write a negative duration into the log and corrupt every average forever.
  const seconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000))
  return seconds < MIN_SESSION_SECONDS ? { startedAt, seconds, short: true } : { startedAt, seconds }
}

/**
 * Averages come from the log itself, never from `profile.seconds / count` —
 * `seconds` can be edited directly (addRemoveTime) or zeroed (resetTime), so
 * deriving from it would produce an average that contradicts the sessions
 * actually listed.
 */
export function summarizeSessions(log: SessionEntry[]): SessionSummary {
  let sessions = 0
  let totalSeconds = 0
  let longestSeconds = 0
  let firstPlayedAt: number | null = null
  let lastPlayedAt: number | null = null

  for (const entry of log) {
    if (firstPlayedAt === null || entry.startedAt < firstPlayedAt) firstPlayedAt = entry.startedAt
    if (lastPlayedAt === null || entry.startedAt > lastPlayedAt) lastPlayedAt = entry.startedAt
    if (entry.short) continue
    sessions++
    totalSeconds += entry.seconds
    if (entry.seconds > longestSeconds) longestSeconds = entry.seconds
  }

  return {
    sessions,
    averageSeconds: sessions === 0 ? 0 : Math.round(totalSeconds / sessions),
    longestSeconds,
    firstPlayedAt,
    lastPlayedAt
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 10 tests.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add package.json package-lock.json vitest.config.ts src/shared/sessionStats.ts src/shared/sessionStats.test.ts src/shared/constants.ts
git commit -m "dev: pure session-stats module, plus Vitest to test it

Averages are computed from the session log rather than seconds/count,
because seconds can be edited by addRemoveTime or zeroed by resetTime and
would produce an average contradicting the sessions actually listed.
Sub-60s cycles are kept but flagged, so a misclick on Play cannot inflate
times-played or drag the average down."
```

---

### Task 2: Persist the log — types and schema

**Files:**
- Modify: `src/shared/types.ts` (extend `Profile`)
- Modify: `src/main/store/schema.ts` (`ProfileSchema`)
- Create: `src/main/store/schema.test.ts`

**Interfaces:**
- Consumes: `SessionEntry` from `@shared/sessionStats` (Task 1).
- Produces: `Profile.sessionLog: SessionEntry[]` — every profile is guaranteed to have this array after `parseAppData`, never `undefined`.

- [ ] **Step 1: Extend the Profile type**

In `src/shared/types.ts`, add the import at the top and the field to `Profile` after `rating`:

```ts
import type { SessionEntry } from './sessionStats'
```

```ts
export interface Profile {
  // ...existing fields, unchanged...
  rating: 0 | 1 | 2 | 3 | 4 | 5
  /**
   * Every Play→Pause cycle, oldest first, kept forever. Counts and averages
   * are derived from this (see summarizeSessions) rather than stored, so they
   * can never drift out of sync with it. Absent in v2 save files — the schema
   * defaults it to [].
   */
  sessionLog: SessionEntry[]
}
```

- [ ] **Step 2: Write the failing schema tests**

Create `src/main/store/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseAppData, freshAppData } from './schema'

describe('sessionLog schema', () => {
  it('defaults to an empty array for a v2 profile that predates it', () => {
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', seconds: 10 } },
      lastSelected: null
    })
    expect(data.profiles.Doom.sessionLog).toEqual([])
  })

  it('preserves a valid log', () => {
    const log = [{ startedAt: 1000, seconds: 120 }]
    const data = parseAppData({ profiles: { Doom: { name: 'Doom', sessionLog: log } } })
    expect(data.profiles.Doom.sessionLog).toEqual(log)
  })

  it('keeps the short flag', () => {
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', sessionLog: [{ startedAt: 1, seconds: 5, short: true }] } }
    })
    expect(data.profiles.Doom.sessionLog[0].short).toBe(true)
  })

  it('falls back to an empty log rather than rejecting a corrupt one', () => {
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', sessionLog: 'not an array' } }
    })
    expect(data.profiles.Doom.sessionLog).toEqual([])
  })

  it('gives a fresh profile an empty log', () => {
    expect(freshAppData().profiles).toEqual({})
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test src/main/store/schema.test.ts`
Expected: FAIL — `sessionLog` is `undefined`.

- [ ] **Step 4: Add the schema**

In `src/main/store/schema.ts`, above `ProfileSchema`:

```ts
const SessionEntrySchema = z.object({
  startedAt: z.number().catch(0),
  seconds: z.number().catch(0),
  short: z.literal(true).optional()
})
```

and inside `ProfileSchema`, after `rating: RatingSchema`:

```ts
    rating: RatingSchema,
    // .catch([]) rather than validation: same contract as every other field
    // here — a partial or corrupt file loses the bad field, never the library.
    sessionLog: z.array(SessionEntrySchema).catch([])
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS, 15 tests total.

- [ ] **Step 6: Typecheck and commit**

`npm run typecheck` will now fail in `src/main/store/profileService.ts` — `freshProfile()` doesn't return the new required field. Fix it by adding to the object literal in `freshProfile`, after `rating: 0`:

```ts
    rating: 0,
    sessionLog: []
```

Also check `src/main/importer/legacyImport.ts` and `src/main/importer/gtprofile.ts` — both construct `Profile` objects. Add `sessionLog: []` to each construction site the compiler flags. A v1 import and a `.gtprofile` import both legitimately start with no session history.

Run `npm run typecheck` until clean, then:

```bash
git add src/shared/types.ts src/main/store/schema.ts src/main/store/schema.test.ts src/main/store/profileService.ts src/main/importer/legacyImport.ts src/main/importer/gtprofile.ts
git commit -m "dev: persist sessionLog on every profile

Defaulted with .catch([]) so v2 save files load untouched, matching the
store's existing contract of never rejecting a file for being partial."
```

---

### Task 3: Record sessions in the timer engine

The subtlety: `checkpointAll()` runs every 5s and rewrites `activeTimers` entries so elapsed time is committed without stopping the clock. A session must survive that, so it needs its own map.

**Files:**
- Modify: `src/main/timer/timerEngine.ts`

**Interfaces:**
- Consumes: `makeSessionEntry` from `@shared/sessionStats` (Task 1); `Profile.sessionLog` (Task 2).
- Produces: no new exports. `timerEngine.pause()` and `timerEngine.pauseAll()` now append to `profile.sessionLog`.

- [ ] **Step 1: Add the session map and record on start**

In `src/main/timer/timerEngine.ts`, add the import:

```ts
import { makeSessionEntry } from '@shared/sessionStats'
```

Add the field next to `activeTimers`:

```ts
  private activeTimers = new Map<string, number>()
  /**
   * name -> the Date.now() when Play was pressed. Deliberately separate from
   * activeTimers: that map's values get rewritten every 5s by checkpointAll()
   * so elapsed time can be committed without stopping the clock, which would
   * silently restart the session on every checkpoint if the two shared a map.
   */
  private sessionStarts = new Map<string, number>()
```

In `start()`, set it alongside `activeTimers`:

```ts
    this.activeTimers.set(name, Date.now())
    this.sessionStarts.set(name, Date.now())
```

- [ ] **Step 2: Fix the status-record wipe in start()**

Still in `start()`, the dropped/on_hold branch currently reads:

```ts
    if (profile.status === 'dropped' || profile.status === 'on_hold') {
      profile.status = 'in_progress'
      profile.statusAt = null
      profile.statusSeconds = null
    }
```

Replace with:

```ts
    if (profile.status === 'dropped' || profile.status === 'on_hold') {
      // Pressing Play is the natural "I'm actually playing this again"
      // signal, so the stale Dropped/On Hold label goes (matches v1's
      // _start_profile). The statusAt/statusSeconds snapshot deliberately
      // stays, matching profileService.setStatus since v2.1.12 — that record
      // is only ever destroyed by the explicit Clear action, never as a side
      // effect of something else.
      profile.status = 'in_progress'
    }
```

- [ ] **Step 3: Append the session on pause**

Replace the body of `pause()`:

```ts
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
          profile.sessionLog.push(makeSessionEntry(sessionStart, Date.now()))
        }
      }
      void dataStore.save()
      void writeStatusLog()
    } catch {
      // never let a save/log failure block pausing or closing
    }
  }
```

- [ ] **Step 4: Keep the other lifecycle methods consistent**

`renameActive()` — carry the session across, or a rename mid-session loses it:

```ts
  renameActive(oldName: string, newName: string): void {
    const start = this.activeTimers.get(oldName)
    if (start !== undefined) {
      this.activeTimers.delete(oldName)
      this.activeTimers.set(newName, start)
    }
    const sessionStart = this.sessionStarts.get(oldName)
    if (sessionStart !== undefined) {
      this.sessionStarts.delete(oldName)
      this.sessionStarts.set(newName, sessionStart)
    }
  }
```

`stopActive()` — the profile is about to be deleted, so drop the session too:

```ts
  stopActive(name: string): void {
    this.activeTimers.delete(name)
    this.sessionStarts.delete(name)
  }
```

`checkpointAll()` and `checkpointOne()` — **do not touch them.** They must leave `sessionStarts` alone; that is the entire reason it exists.

`pauseAll()` already delegates to `pause()`, so quitting the app closes open sessions with no extra work.

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/timer/timerEngine.ts
git commit -m "dev: record a session on every Play/Pause cycle

sessionStarts is a separate map from activeTimers because checkpointAll()
rewrites the latter every 5 seconds to commit elapsed time without stopping
the clock — sharing one map would restart the session on every checkpoint.

Also stops start() nulling statusAt/statusSeconds when reviving a dropped or
on-hold game. That was the last remaining path that destroyed a status
snapshot as a side effect; since v2.1.12 setStatus preserves it, and the two
disagreeing was the bug waiting to happen."
```

---

### Task 4: The deliberate clear-completion action

**Files:**
- Modify: `src/main/store/profileService.ts` (add `clearStatusRecord`)
- Modify: `src/shared/ipcContract.ts` (channel + API signature)
- Modify: `src/main/ipc/profiles.ipc.ts` (handler)
- Modify: `src/preload/index.ts` (bridge)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `window.api.profiles.clearStatusRecord(name: string): Promise<Profile>` — clears `statusAt` and `statusSeconds`, leaves `status` and `seconds` alone.

- [ ] **Step 1: Add the service method**

In `src/main/store/profileService.ts`, directly after `setStatus`:

```ts
  /**
   * The ONLY thing that destroys a completion snapshot. Everything else —
   * un-completing, reviving a dropped game, playing more — deliberately
   * preserves it (see the comment in setStatus). The caller is responsible
   * for confirming first; this is the irreversible half.
   */
  async clearStatusRecord(name: string): Promise<Profile> {
    const profile = requireProfile(name)
    profile.statusAt = null
    profile.statusSeconds = null
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },
```

- [ ] **Step 2: Add the IPC channel and API signature**

In `src/shared/ipcContract.ts`, in the `IPC.profiles` block after `setStatus`:

```ts
    setStatus: 'profiles:setStatus',
    clearStatusRecord: 'profiles:clearStatusRecord',
```

and in `GameTimerApi['profiles']` after `setStatus`:

```ts
    setStatus(name: string, status: Status): Promise<Profile>
    /** Irreversibly clears the completion/dropped snapshot. Confirm with the user before calling. */
    clearStatusRecord(name: string): Promise<Profile>
```

- [ ] **Step 3: Wire the handler and the bridge**

In `src/main/ipc/profiles.ipc.ts`, after the `setStatus` handler:

```ts
  ipcMain.handle(IPC.profiles.clearStatusRecord, (_e, name: string) =>
    profileService.clearStatusRecord(name)
  )
```

In `src/preload/index.ts`, in the `profiles` object after `setStatus`:

```ts
    clearStatusRecord: (name) => ipcRenderer.invoke(IPC.profiles.clearStatusRecord, name),
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/main/store/profileService.ts src/shared/ipcContract.ts src/main/ipc/profiles.ipc.ts src/preload/index.ts
git commit -m "dev: explicit clearStatusRecord, the only path that destroys a completion snapshot"
```

---

### Task 5: Localize the new strings

Doing this before the component means no hardcoded English ever exists, not even briefly.

**Files:**
- Modify: `src/renderer/src/locales/{en,fr,es,de,it,pt,ru,ja,ko,zh}/common.json`

**Interfaces:**
- Consumes: nothing.
- Produces: keys `ctx_info`, `info_title`, `stat_sessions`, `stat_avg_session`, `stat_longest_session`, `stat_first_played`, `stat_last_played`, `btn_clear_completion`, `confirm_clear_completion_msg` in all 10 locales.

- [ ] **Step 1: Add the keys**

Each file's keys are sorted alphabetically — insert each new key in its correct alphabetical position, do not append at the end. `confirm_clear_completion_msg` uses i18next interpolation (`{{name}}`), same as the existing `confirm_delete_msg`.

`en/common.json`:

```json
"btn_clear_completion": "Clear completion record",
"confirm_clear_completion_msg": "Permanently delete {{name}}'s completion date and the playtime it was completed at?\n\nThis cannot be undone.",
"ctx_info": "More info",
"info_title": "Game info",
"stat_avg_session": "Average session",
"stat_first_played": "First played",
"stat_last_played": "Last played",
"stat_longest_session": "Longest session",
"stat_sessions": "Sessions"
```

`fr/common.json`:

```json
"btn_clear_completion": "Effacer les données de fin",
"confirm_clear_completion_msg": "Supprimer définitivement la date de fin de {{name}} et le temps de jeu associé ?\n\nCette action est irréversible.",
"ctx_info": "Plus d'infos",
"info_title": "Informations sur le jeu",
"stat_avg_session": "Session moyenne",
"stat_first_played": "Première partie",
"stat_last_played": "Dernière partie",
"stat_longest_session": "Session la plus longue",
"stat_sessions": "Sessions"
```

`es/common.json`:

```json
"btn_clear_completion": "Borrar registro de finalización",
"confirm_clear_completion_msg": "¿Eliminar permanentemente la fecha de finalización de {{name}} y el tiempo de juego con el que se completó?\n\nEsta acción no se puede deshacer.",
"ctx_info": "Más información",
"info_title": "Información del juego",
"stat_avg_session": "Sesión media",
"stat_first_played": "Primera partida",
"stat_last_played": "Última partida",
"stat_longest_session": "Sesión más larga",
"stat_sessions": "Sesiones"
```

`de/common.json`:

```json
"btn_clear_completion": "Abschlussdaten löschen",
"confirm_clear_completion_msg": "Abschlussdatum von {{name}} und die dabei erreichte Spielzeit endgültig löschen?\n\nDies kann nicht rückgängig gemacht werden.",
"ctx_info": "Mehr Infos",
"info_title": "Spielinformationen",
"stat_avg_session": "Durchschnittliche Sitzung",
"stat_first_played": "Zuerst gespielt",
"stat_last_played": "Zuletzt gespielt",
"stat_longest_session": "Längste Sitzung",
"stat_sessions": "Sitzungen"
```

`it/common.json`:

```json
"btn_clear_completion": "Cancella dati di completamento",
"confirm_clear_completion_msg": "Eliminare definitivamente la data di completamento di {{name}} e il tempo di gioco corrispondente?\n\nQuesta azione non può essere annullata.",
"ctx_info": "Altre info",
"info_title": "Informazioni sul gioco",
"stat_avg_session": "Sessione media",
"stat_first_played": "Prima partita",
"stat_last_played": "Ultima partita",
"stat_longest_session": "Sessione più lunga",
"stat_sessions": "Sessioni"
```

`pt/common.json`:

```json
"btn_clear_completion": "Limpar registo de conclusão",
"confirm_clear_completion_msg": "Eliminar permanentemente a data de conclusão de {{name}} e o tempo de jogo correspondente?\n\nEsta ação não pode ser anulada.",
"ctx_info": "Mais informações",
"info_title": "Informações do jogo",
"stat_avg_session": "Sessão média",
"stat_first_played": "Primeira vez jogado",
"stat_last_played": "Última vez jogado",
"stat_longest_session": "Sessão mais longa",
"stat_sessions": "Sessões"
```

`ru/common.json`:

```json
"btn_clear_completion": "Очистить данные о завершении",
"confirm_clear_completion_msg": "Безвозвратно удалить дату завершения игры {{name}} и время прохождения?\n\nЭто действие нельзя отменить.",
"ctx_info": "Подробнее",
"info_title": "Информация об игре",
"stat_avg_session": "Средняя сессия",
"stat_first_played": "Первая игра",
"stat_last_played": "Последняя игра",
"stat_longest_session": "Самая длинная сессия",
"stat_sessions": "Сессии"
```

`ja/common.json`:

```json
"btn_clear_completion": "クリア記録を削除",
"confirm_clear_completion_msg": "{{name}} のクリア日とクリア時のプレイ時間を完全に削除しますか？\n\nこの操作は取り消せません。",
"ctx_info": "詳細情報",
"info_title": "ゲーム情報",
"stat_avg_session": "平均セッション",
"stat_first_played": "初プレイ",
"stat_last_played": "最終プレイ",
"stat_longest_session": "最長セッション",
"stat_sessions": "セッション数"
```

`ko/common.json`:

```json
"btn_clear_completion": "완료 기록 지우기",
"confirm_clear_completion_msg": "{{name}}의 완료 날짜와 완료 시점의 플레이 시간을 영구적으로 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.",
"ctx_info": "자세히 보기",
"info_title": "게임 정보",
"stat_avg_session": "평균 세션",
"stat_first_played": "처음 플레이",
"stat_last_played": "마지막 플레이",
"stat_longest_session": "최장 세션",
"stat_sessions": "세션"
```

`zh/common.json`:

```json
"btn_clear_completion": "清除完成记录",
"confirm_clear_completion_msg": "确定要永久删除《{{name}}》的完成日期和完成时的游玩时长吗？\n\n此操作无法撤销。",
"ctx_info": "更多信息",
"info_title": "游戏信息",
"stat_avg_session": "平均时长",
"stat_first_played": "首次游玩",
"stat_last_played": "最近游玩",
"stat_longest_session": "最长一次",
"stat_sessions": "游玩次数"
```

- [ ] **Step 2: Verify every locale has all nine keys**

Run:

```bash
node -e "const ks=['ctx_info','info_title','stat_sessions','stat_avg_session','stat_longest_session','stat_first_played','stat_last_played','btn_clear_completion','confirm_clear_completion_msg'];for(const l of ['en','fr','es','de','it','pt','ru','ja','ko','zh']){const j=require('./src/renderer/src/locales/'+l+'/common.json');const missing=ks.filter(k=>!(k in j));console.log(l, missing.length?'MISSING '+missing.join(','):'ok')}"
```

Expected: every locale prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/locales
git commit -m "dev: localize the session-stats strings in all 10 languages"
```

---

### Task 6: The More Info window

**Files:**
- Create: `src/renderer/src/components/dialogs/GameInfoDialog.tsx`
- Modify: `src/renderer/src/state/uiStore.ts` (add `'info'` to `DialogKind`)
- Modify: `src/renderer/src/App.tsx` (mount the dialog)
- Modify: `src/renderer/src/components/gamelist/GameList.tsx` (context-menu entry)

**Interfaces:**
- Consumes: `summarizeSessions` and `SessionSummary` from `@shared/sessionStats` (Task 1); `Profile.sessionLog` (Task 2); `window.api.profiles.clearStatusRecord` (Task 4); the locale keys from Task 5.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Allow the new dialog kind**

In `src/renderer/src/state/uiStore.ts`:

```ts
export type DialogKind = 'modify' | 'notes' | 'settings' | 'info' | null
```

- [ ] **Step 2: Create the dialog**

Create `src/renderer/src/components/dialogs/GameInfoDialog.tsx`:

```tsx
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { summarizeSessions } from '@shared/sessionStats'
import { formatSeconds } from '@shared/format'
import { toast } from '../common/Toast'

/**
 * Read-only, except for the one destructive action at the bottom. Everything
 * numeric is derived from sessionLog on render rather than stored, so nothing
 * here can disagree with the log it came from.
 */
export function GameInfoDialog({ name, onClose }: { name: string; onClose: () => void }): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  const summary = useMemo(() => summarizeSessions(profile?.sessionLog ?? []), [profile?.sessionLog])

  if (!profile) return null

  const isCompleted = profile.status === 'completed'
  const hasRecord = profile.statusAt != null || profile.statusSeconds != null

  async function handleClearRecord(): Promise<void> {
    if (!window.confirm(t('confirm_clear_completion_msg', { name }))) return
    try {
      useProfilesStore.getState().upsert(await window.api.profiles.clearStatusRecord(name))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Modal title={t('info_title')} onClose={onClose} width="max-w-sm">
      <div className="mb-4 text-base font-semibold text-text">{profile.name}</div>

      {/*
       * Played is deliberately the only playtime with visual weight. Stage 3
       * adds "Game was open" and "Idle" below this block, and they must read
       * as context for this number, never as rivals to it.
       */}
      <div className="mb-4 border-b border-card pb-4">
        <div className="text-xs text-subtext">{t('col_time_played')}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-text">
          {formatSeconds(profile.seconds)}
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        <Row label={t('stat_sessions')} value={String(summary.sessions)} />
        <Row label={t('stat_avg_session')} value={summary.sessions > 0 ? formatSeconds(summary.averageSeconds) : '—'} />
        <Row label={t('stat_longest_session')} value={summary.sessions > 0 ? formatSeconds(summary.longestSeconds) : '—'} />
        <Row label={t('stat_first_played')} value={formatDate(summary.firstPlayedAt)} />
        <Row label={t('stat_last_played')} value={formatDate(summary.lastPlayedAt)} />
        {isCompleted && <Row label={t('col_completed_on')} value={profile.statusAt ?? '—'} />}
        {isCompleted && (
          <Row
            label={t('col_completed_time')}
            value={profile.statusSeconds != null ? formatSeconds(profile.statusSeconds) : '—'}
          />
        )}
      </dl>

      {hasRecord && (
        <button
          onClick={() => void handleClearRecord()}
          className="mt-5 w-full rounded bg-card py-2 text-xs text-red transition-opacity hover:opacity-80"
        >
          {t('btn_clear_completion')}
        </button>
      )}
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-subtext">{label}</dt>
      <dd className="tabular-nums text-text">{value}</dd>
    </div>
  )
}

/** Epoch ms -> the same YYYY-MM-DD shape the rest of the app stores dates in. */
function formatDate(ms: number | null): string {
  if (ms === null) return '—'
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

- [ ] **Step 3: Mount it**

In `src/renderer/src/App.tsx`, add the import next to the other dialogs:

```tsx
import { GameInfoDialog } from './components/dialogs/GameInfoDialog'
```

and the mount next to the others:

```tsx
      {dialog === 'info' && dialogTarget && <GameInfoDialog name={dialogTarget} onClose={closeDialog} />}
```

- [ ] **Step 4: Add the context-menu entry**

In `src/renderer/src/components/gamelist/GameList.tsx`, in `menuItemsFor`, add as the first entry:

```ts
    return [
      { label: t('ctx_info'), onClick: () => openDialog('info', name) },
      { label: t('ctx_modify'), onClick: () => openDialog('modify', name) },
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/dialogs/GameInfoDialog.tsx src/renderer/src/state/uiStore.ts src/renderer/src/App.tsx src/renderer/src/components/gamelist/GameList.tsx
git commit -m "dev: More info window on right-click

Every figure is derived from sessionLog at render time rather than stored,
so nothing shown can disagree with the log it came from. Played keeps all
the visual weight — stage 3 adds open/idle time underneath it as context."
```

---

### Task 7: End-to-end verification in the real app

Unit tests cover the maths; this covers the wiring — that a real Play/Pause click actually lands a session on disk.

**Files:**
- Create: `scripts/verify-stage1.cjs`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Patch the build for an isolated test run**

Test launches otherwise read and write the **real** save library — `APPDATA` does not isolate Electron, because `app.getPath('appData')` goes through the Windows shell API and `src/main/index.ts` pins `userData` on top of it regardless.

Run:

```bash
npm run build && node -e "const fs=require('fs');const f='out/main/index.js';let s=fs.readFileSync(f,'utf8');s=s.replace('electron.app.getPath(\"appData\")','(process.env.GAMUT_TEST_APPDATA || electron.app.getPath(\"appData\"))');fs.writeFileSync(f,s);"
```

- [ ] **Step 2: Write the verification script**

Create `scripts/verify-stage1.cjs`:

```js
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const DATA = path.join(ROOT, 'game_timer_data.json')
const GAME = 'Session Test Game'

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`)
}
const read = () => JSON.parse(fs.readFileSync(DATA, 'utf8')).profiles[GAME]

;(async () => {
  fs.mkdirSync(ROOT, { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'firstrun.json'), '{"legacyImportState":"skipped"}')
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {
        [GAME]: {
          name: GAME, seconds: 0, iconFile: null, bgColor: null, bgImage: null,
          status: 'completed', statusAt: '2026-03-15', statusSeconds: 3600,
          genres: [], lastPlayed: null, startedDate: null, notes: '', rating: 0, sessionLog: []
        }
      },
      lastSelected: GAME,
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en' }
    })
  )

  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, GAMUT_TEST_APPDATA: SCRATCH }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1800)

  console.log('\n=== a short Play/Pause is logged but not counted ===')
  await win.locator('button:has-text("Play")').click()
  await win.waitForTimeout(2500)
  await win.locator('button:has-text("Pause")').click()
  await win.waitForTimeout(900)
  const afterShort = read()
  check('one entry written to the log', afterShort.sessionLog.length, 1)
  check('flagged short', afterShort.sessionLog[0].short, true)

  console.log('\n=== More info opens and reflects the log ===')
  await win.locator(`button:has-text("${GAME}")`).first().click({ button: 'right' })
  await win.waitForTimeout(400)
  await win.locator('text=More info').click()
  await win.waitForTimeout(500)
  const body = await win.locator('.max-w-sm').innerText()
  check('sessions reads 0 (the only session was short)', /Sessions\s+0/.test(body), true)
  check('average shows a dash, not NaN', body.includes('NaN'), false)
  check('completion date is shown', body.includes('2026-03-15'), true)

  console.log('\n=== clearing the record is the only thing that destroys it ===')
  // Electron does not always surface window.confirm through Playwright's
  // dialog event. Stub it in the page instead — deterministic either way.
  await win.evaluate(() => {
    window.confirm = () => true
  })
  await win.locator('button:has-text("Clear completion record")').click()
  await win.waitForTimeout(900)
  const cleared = read()
  check('statusAt cleared', cleared.statusAt, null)
  check('statusSeconds cleared', cleared.statusSeconds, null)
  check('status itself untouched', cleared.status, 'completed')
  check('playtime untouched', typeof cleared.seconds, 'number')

  await app.close()
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error('CRASHED:', e)
  process.exit(1)
})
```

- [ ] **Step 3: Run it**

Run: `node scripts/verify-stage1.cjs`
Expected: `ALL CHECKS PASSED`, 9 checks.

- [ ] **Step 4: Confirm the test can actually fail**

A verification that passes against broken code is worthless. Temporarily break it.

**`git stash` will NOT work here** — Task 3 is already committed, so there is
nothing uncommitted to stash and the suite would silently run against the fixed
code and "pass". Check the file out from the commit before Task 3 instead:

```bash
git checkout <task-2-commit> -- src/main/timer/timerEngine.ts
grep -c sessionStarts src/main/timer/timerEngine.ts   # must print 0
npm run build && node -e "const fs=require('fs');const f='out/main/index.js';let s=fs.readFileSync(f,'utf8');s=s.replace('electron.app.getPath(\"appData\")','(process.env.GAMUT_TEST_APPDATA || electron.app.getPath(\"appData\"))');fs.writeFileSync(f,s);"
node scripts/verify-stage1.cjs
```

Expected: FAIL on "one entry written to the log" (expected 1, got 0). Then restore
and confirm it came back:

```bash
git checkout HEAD -- src/main/timer/timerEngine.ts
grep -c sessionStarts src/main/timer/timerEngine.ts   # must print 8
```

- [ ] **Step 5: Rebuild clean and confirm no test hook shipped**

```bash
npm run build
grep -c GAMUT_TEST_APPDATA out/main/index.js
```

Expected: `0`.

- [ ] **Step 6: Add the scratch dir to .gitignore and commit**

Add `.verify-tmp/` to `.gitignore` under the Gamut section.

```bash
git add scripts/verify-stage1.cjs .gitignore
git commit -m "dev: end-to-end verification for stage 1

Isolates userData via a build-time patch — setting APPDATA does not work,
Electron resolves appData through the Windows shell API and index.ts pins
userData on top of it, so an unisolated run reads and writes the real save
library."
```

- [ ] **Step 7: Full green run before handing back**

```bash
npm test && npm run typecheck && npm run build && node scripts/verify-stage1.cjs
```

All four must pass. Do not report stage 1 complete otherwise.

---

## Not in this stage

Deliberately deferred, do not build them here:

- Launch counting, `openSeconds`, idle time — stage 3, needs process detection.
- The Add Game picker, Steam art, `exePath`/`steamAppId` — stage 2.
- `autoFetchArt` / `autoStartTimer` settings — stage 2 and 3.
- The Modify dialog remaster — stage 2.
- Any change to the Data tab table — the spec keeps it as-is.
