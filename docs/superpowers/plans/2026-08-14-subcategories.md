# Sub-categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a game's playtime be broken down into optional, named sub-categories (e.g. "100% Completion", "Casual", "Challenge run") without touching rating, notes, screenshots, genres, or completion status — which all stay one shared value per game, exactly as today.

**Architecture:** A sub-category is `{id, name, seconds}` — a labeled running total, living in a new `subCategories` array on `Profile`. The real-time timer is completely unchanged; a small in-memory snapshot in `timerEngine` (the game's `seconds` value at the moment a session started) lets a later "which category was this?" answer credit the correct delta to a bucket, whether answered instantly or minutes after the session already ended. Full rationale in the spec.

**Tech Stack:** Electron main/renderer/preload (existing), Zod (schema validation), Zustand (renderer state), Vitest (unit tests), Playwright via `scripts/verify-*.cjs` (real-app E2E, existing project convention).

**Spec:** `docs/superpowers/specs/2026-08-14-subcategories-design.md` — read it before starting; this plan assumes everything in it.

## Global Constraints

- **Branch:** all work happens on `dev`, committed and pushed there directly — this repo does not use a PR/worktree flow for Gamut (see project memory `feedback-gamut-push-to-dev`). Never touch `main`.
- **⚠️ Before running ANY `scripts/verify-*.cjs` script (Task 10 only, but this applies to any future run too):**
  1. Back up the real save file first: copy `%APPDATA%\gametimer-dev\game_timer_data.json` somewhere safe.
  2. Confirm the isolation patch is present in the build about to be tested: `grep -c GAMUT_TEST_APPDATA out/main/index.js` must return `1` or more, and the match must be the actual patched expression (`process.env.GAMUT_TEST_APPDATA || electron.app.getPath("appData")`), not just the bare string. If it's missing, run `npm run build` fresh and let the verify script's own `ensureBundlePatched()` apply it before anything else executes.
  3. This is not a one-time check for the session — re-verify it after every `npm run build` / `npm run package` / `npm run package:dev`, because any of those silently wipes the patch. This exact mistake destroyed the real save file once already (2026-08-14) — see project memory `feedback-isolate-gamut-test-launches`.
- Every new profile mutator returns the full updated `Profile` (matching every existing method in `profileService.ts`) so the renderer can `upsert()` it — never a partial patch.
- `subCategories` and `subCategoriesEnabled` follow the exact `null = inherit global` pattern already used by `autoFetchArt`/`autoStartTimer` — do not invent a different convention.
- No new IPC channel for "detect a timer just started" — Task 6 reuses the existing `timer:tick` broadcast (which already fires for both manual Play and gameWatcher auto-start) by diffing consecutive payloads in the renderer. Do not add a `timer:started` event.

---

## File Structure

| File | Change |
|---|---|
| `src/shared/types.ts` | Modify — add `SubCategory`, extend `Profile`/`Settings` |
| `src/shared/subCategories.ts` | **Create** — pure helpers (`newSubCategory`, `creditSubCategory`) |
| `src/shared/subCategories.test.ts` | **Create** — Vitest unit tests for the above |
| `src/main/store/schema.ts` | Modify — `SubCategorySchema`, wire into `ProfileSchema`/`SettingsSchema` |
| `src/main/store/schema.test.ts` | Modify — coverage for the new fields' defaulting |
| `src/main/store/profileService.ts` | Modify — `freshProfile()` defaults, 5 new mutators, `setStatus` override param |
| `src/main/timer/timerEngine.ts` | Modify — pending-category-session snapshot |
| `src/shared/ipcContract.ts` | Modify — new channel names, preload API types |
| `src/main/ipc/profiles.ipc.ts` | Modify — register new handlers |
| `src/preload/index.ts` | Modify — expose new methods |
| `src/renderer/src/state/uiStore.ts` | Modify — 3 new `DialogKind` values |
| `src/renderer/src/state/timerStore.ts` | Modify — detect newly-started profiles, open the prompt |
| `src/renderer/src/components/library/LibraryDetail.tsx` | Modify — sub-category list, Complete-button flow |
| `src/renderer/src/components/library/LibraryTab.tsx` | Modify — "+ New sub-category" (always) and "Show profile stats" (once ≥1 exists) context-menu items |
| `src/renderer/src/components/dialogs/SubCategoryPromptDialog.tsx` | **Create** — per-session "which category?" modal |
| `src/renderer/src/components/dialogs/CompleteTimerDialog.tsx` | **Create** — Complete's "which timer?" modal |
| `src/renderer/src/components/dialogs/ProfileStatsPerGameDialog.tsx` | **Create** — right-click stats window |
| `src/renderer/src/components/dialogs/SettingsDialog.tsx` | Modify — global toggle in the Games tab |
| `src/renderer/src/components/datatab/DataTab.tsx` | Modify — drop the Genres column from Advanced |
| `src/renderer/src/App.tsx` | Modify — mount the 3 new dialogs |
| `src/renderer/src/locales/en/common.json` | Modify — new strings |
| `scripts/verify-subcategories.cjs` | **Create** — real-app E2E, Task 10 |

---

### Task 1: Data model — types, schema, pure helpers

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/shared/subCategories.ts`
- Create: `src/shared/subCategories.test.ts`
- Modify: `src/main/store/schema.ts`
- Modify: `src/main/store/schema.test.ts`

**Interfaces:**
- Produces: `SubCategory { id: string; name: string; seconds: number }`, `newSubCategory(id: string, name: string): SubCategory`, `creditSubCategory(subCategories: SubCategory[], id: string, deltaSeconds: number): SubCategory[]` — later tasks import all three from `@shared/subCategories` / `@shared/types`.

- [ ] **Step 1: Add the type**

In `src/shared/types.ts`, add right after the `OverlayCorner` type (before `interface Profile`):

```ts
export interface SubCategory {
  id: string
  name: string
  /** This bucket's own running total — separate from, and always ≤, profile.seconds. */
  seconds: number
}
```

Then add two fields to `Profile`, right after `installDir: string | null` (last field before the closing brace):

```ts
  /** L (2026-08-14): optional time-tracking breakdown for this game. Empty for every game not using the feature. */
  subCategories: SubCategory[]
  /** null = follow the global setting. Explicit true/false overrides it for this game only. */
  subCategoriesEnabled: boolean | null
```

And one field to `Settings`, right after `autoStartTimer: boolean`:

```ts
  /** Default for games whose own subCategoriesEnabled is null. */
  subCategoriesEnabled: boolean
```

- [ ] **Step 2: Write the pure helpers**

Create `src/shared/subCategories.ts`:

```ts
import type { SubCategory } from './types'

export function newSubCategory(id: string, name: string): SubCategory {
  return { id, name, seconds: 0 }
}

/**
 * Adds `deltaSeconds` to one sub-category's own total. Never mutates —
 * returns a new array, matching how `profile.subCategories = creditSubCategory(...)`
 * is reassigned at every call site.
 *
 * A delta of zero or less, or an id that doesn't match any category, is a
 * no-op that returns the input array unchanged (not a copy) — this is what
 * lets a session where nothing measurable happened, or a category deleted
 * out from under a still-pending prompt, fail silently instead of throwing.
 */
export function creditSubCategory(
  subCategories: SubCategory[],
  id: string,
  deltaSeconds: number
): SubCategory[] {
  if (deltaSeconds <= 0) return subCategories
  if (!subCategories.some((c) => c.id === id)) return subCategories
  return subCategories.map((c) => (c.id === id ? { ...c, seconds: c.seconds + deltaSeconds } : c))
}
```

- [ ] **Step 3: Write the failing tests**

Create `src/shared/subCategories.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newSubCategory, creditSubCategory } from './subCategories'

describe('newSubCategory', () => {
  it('starts at zero seconds', () => {
    expect(newSubCategory('id-1', 'Casual')).toEqual({ id: 'id-1', name: 'Casual', seconds: 0 })
  })
})

describe('creditSubCategory', () => {
  const base = [newSubCategory('a', 'A'), newSubCategory('b', 'B')]

  it('adds the delta to the matching category only', () => {
    const result = creditSubCategory(base, 'a', 120)
    expect(result.find((c) => c.id === 'a')?.seconds).toBe(120)
    expect(result.find((c) => c.id === 'b')?.seconds).toBe(0)
  })

  it('adds on top of an existing total rather than overwriting it', () => {
    const withSome = creditSubCategory(base, 'a', 1800) // 30:00
    const result = creditSubCategory(withSome, 'a', 120) // +2:00
    expect(result.find((c) => c.id === 'a')?.seconds).toBe(1920) // 32:00, never resynced to some other total
  })

  it('does not mutate the input array', () => {
    const result = creditSubCategory(base, 'a', 60)
    expect(result).not.toBe(base)
    expect(base.find((c) => c.id === 'a')?.seconds).toBe(0)
  })

  it('is a no-op for an unknown id', () => {
    const result = creditSubCategory(base, 'nonexistent', 60)
    expect(result).toBe(base)
  })

  it('is a no-op for a zero or negative delta', () => {
    expect(creditSubCategory(base, 'a', 0)).toBe(base)
    expect(creditSubCategory(base, 'a', -5)).toBe(base)
  })
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- subCategories`
Expected: all 6 tests PASS (the implementation was written alongside the test above, so there's no red step here — this file has no prior behavior to regress).

- [ ] **Step 5: Add the Zod schema**

In `src/main/store/schema.ts`, add `SubCategorySchema` right after `SessionAggregateSchema` (around line 67), modeled on `NoteSchema`'s id-generation:

```ts
const SubCategorySchema = z.object({
  id: z.string().min(1).catch(() => Math.random().toString(36).slice(2)),
  name: z.string().catch(''),
  seconds: z.number().catch(0)
})
```

Then in `ProfileSchema`, add two fields right after `installDir: z.string().nullable().catch(null)` (last field, currently followed by the closing `})`):

```ts
    subCategories: z.array(SubCategorySchema).catch([]),
    subCategoriesEnabled: z.boolean().nullable().catch(null)
```

Then in `SettingsSchema`, add one field right after `autoStartTimer: z.boolean().catch(false),`:

```ts
  subCategoriesEnabled: z.boolean().catch(true),
```

- [ ] **Step 6: Write the failing schema test**

Open `src/main/store/schema.test.ts`, find the existing test that checks a field the codebase added this way before (search for `autoStartTimer` or `noteList` in that file to match the existing assertion style exactly), and add two new tests near it:

```ts
it('defaults subCategories to an empty array when absent', () => {
  const result = parseAppData({ profiles: { Game: { name: 'Game' } } })
  expect(result.profiles.Game.subCategories).toEqual([])
})

it('defaults subCategoriesEnabled to null on a profile and true globally when absent', () => {
  const result = parseAppData({ profiles: { Game: { name: 'Game' } } })
  expect(result.profiles.Game.subCategoriesEnabled).toBeNull()
  expect(result.settings.subCategoriesEnabled).toBe(true)
})

it('keeps existing sub-category data intact when parsed again', () => {
  const raw = {
    profiles: {
      Game: {
        name: 'Game',
        subCategories: [{ id: 'x', name: '100%', seconds: 3600 }],
        subCategoriesEnabled: false
      }
    }
  }
  const result = parseAppData(raw)
  expect(result.profiles.Game.subCategories).toEqual([{ id: 'x', name: '100%', seconds: 3600 }])
  expect(result.profiles.Game.subCategoriesEnabled).toBe(false)
})
```

- [ ] **Step 7: Run to verify pass**

Run: `npm run test -- schema`
Expected: PASS, including the 3 new tests. (This is validation-only, so — like Step 4 — there is no separate red step; the schema change in Step 5 and the test in Step 6 are the same logical change.)

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean. `Profile`/`Settings` now require the two new fields everywhere they're constructed — this will surface any object literal that needs Step-9-in-a-later-task's `freshProfile()` update, and confirms nothing else in the codebase builds a raw `Profile`/`Settings` object literal outside `profileService.ts` and `schema.ts` (if it does, fix that call site now, using the same defaults: `subCategories: []`, `subCategoriesEnabled: null`/`true`).

- [ ] **Step 9: Commit**

```bash
git add src/shared/types.ts src/shared/subCategories.ts src/shared/subCategories.test.ts src/main/store/schema.ts src/main/store/schema.test.ts
git commit -m "subcategories: data model — SubCategory type, schema, pure credit helper"
git push origin dev
```

---

### Task 2: Timer engine — pending session-start snapshot

**Files:**
- Modify: `src/main/timer/timerEngine.ts`

**Interfaces:**
- Consumes: nothing new (uses `dataStore`, already imported).
- Produces: `timerEngine.getPendingCategoryStart(name: string): number | undefined`, `timerEngine.clearPendingCategoryStart(name: string): void` — Task 3's `assignSubCategorySession` calls both.

- [ ] **Step 1: Add the map and populate it in `start()`**

In `src/main/timer/timerEngine.ts`, add a new private field right after `sessionStarts`:

```ts
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
```

In `start(name)`, add one line right after `this.sessionStarts.set(name, Date.now())`:

```ts
    this.pendingCategoryStart.set(name, profile.seconds)
```

(This must read `profile.seconds` before anything in `start()` could change it — nothing above this line does, so placing it here or at the very top of the function are equivalent; keeping it next to `sessionStarts.set` groups the two per-session snapshots together.)

- [ ] **Step 2: Add the getter and clearer**

Add two public methods, near `renameActive`/`stopActive`:

```ts
  getPendingCategoryStart(name: string): number | undefined {
    return this.pendingCategoryStart.get(name)
  }

  clearPendingCategoryStart(name: string): void {
    this.pendingCategoryStart.delete(name)
  }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean — this task only adds methods, nothing calls them yet.

- [ ] **Step 4: Run the full unit suite to confirm nothing broke**

Run: `npm run test`
Expected: all existing tests still PASS — `pendingCategoryStart` is purely additive and never read by any existing code path.

- [ ] **Step 5: Commit**

```bash
git add src/main/timer/timerEngine.ts
git commit -m "subcategories: timerEngine tracks each session's starting seconds"
git push origin dev
```

---

### Task 3: profileService mutators + IPC wiring

**Files:**
- Modify: `src/main/store/profileService.ts`
- Modify: `src/shared/ipcContract.ts`
- Modify: `src/main/ipc/profiles.ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `newSubCategory`, `creditSubCategory` (Task 1), `timerEngine.getPendingCategoryStart`/`clearPendingCategoryStart` (Task 2).
- Produces: `window.api.profiles.createSubCategory(name, categoryName): Promise<Profile>`, `renameSubCategory(name, categoryId, newName): Promise<Profile>`, `deleteSubCategory(name, categoryId): Promise<Profile>`, `setSubCategoriesEnabled(name, value: boolean | null): Promise<Profile>`, `assignSubCategorySession(name, categoryId): Promise<Profile>`, and `setStatus(name, status, overrideSeconds?: number): Promise<Profile>` (extended signature — the existing two-argument call sites keep compiling unchanged).

- [ ] **Step 1: `freshProfile()` defaults**

In `src/main/store/profileService.ts`, add two fields to `freshProfile()`'s return object, right after `installDir: null`:

```ts
    subCategories: [],
    subCategoriesEnabled: null,
```

- [ ] **Step 2: Import the new helpers**

Add to the existing import block at the top of the file:

```ts
import { newSubCategory, creditSubCategory } from '@shared/subCategories'
```

- [ ] **Step 3: Add the five mutators**

Add these methods to the `profileService` object, right after `setAutoStartTimer` (around line 364):

```ts
  async createSubCategory(name: string, categoryName: string): Promise<Profile> {
    const trimmed = categoryName.trim()
    if (!trimmed) throw new Error('Name cannot be empty')
    const profile = requireProfile(name)
    profile.subCategories = [...profile.subCategories, newSubCategory(randomUUID(), trimmed)]
    await dataStore.safeSave()
    return profile
  },

  async renameSubCategory(name: string, categoryId: string, newName: string): Promise<Profile> {
    const trimmed = newName.trim()
    if (!trimmed) throw new Error('Name cannot be empty')
    const profile = requireProfile(name)
    const category = profile.subCategories.find((c) => c.id === categoryId)
    if (category) category.name = trimmed
    await dataStore.safeSave()
    return profile
  },

  async deleteSubCategory(name: string, categoryId: string): Promise<Profile> {
    const profile = requireProfile(name)
    profile.subCategories = profile.subCategories.filter((c) => c.id !== categoryId)
    await dataStore.safeSave()
    return profile
  },

  /** null = follow the global setting; true/false override it for this game. Never deletes subCategories — see the design spec's "disable ≠ delete" rule. */
  async setSubCategoriesEnabled(name: string, value: boolean | null): Promise<Profile> {
    const profile = requireProfile(name)
    profile.subCategoriesEnabled = value
    await dataStore.safeSave()
    return profile
  },

  /**
   * Credits `categoryId` with the growth in the main total since this
   * session's timer last started (timerEngine's pendingCategoryStart
   * snapshot) — not a live re-measurement, so it's correct whether this is
   * called while the timer is still running or after it has already been
   * paused. See timerEngine.ts and the design spec.
   *
   * A no-op (still clears the pending snapshot) if the snapshot is already
   * gone — the app restarted since this session started, or this session was
   * already resolved. Never throws for that; it's an expected race, not a bug.
   */
  async assignSubCategorySession(name: string, categoryId: string): Promise<Profile> {
    const startSeconds = timerEngine.getPendingCategoryStart(name)
    const profile = requireProfile(name)
    if (startSeconds !== undefined) {
      if (timerEngine.isRunning(name)) timerEngine.checkpointOne(name)
      const elapsed = profile.seconds - startSeconds
      profile.subCategories = creditSubCategory(profile.subCategories, categoryId, elapsed)
      timerEngine.clearPendingCategoryStart(name)
      await dataStore.safeSave()
    }
    return profile
  },
```

- [ ] **Step 4: Extend `setStatus`**

Replace the existing `setStatus` method (around line 206) with:

```ts
  async setStatus(name: string, status: Status, overrideSeconds?: number): Promise<Profile> {
    if (status !== 'in_progress' && timerEngine.isRunning(name)) {
      timerEngine.pause(name)
    }
    const profile = requireProfile(name)
    profile.status = status
    if (status !== 'in_progress') {
      profile.statusAt = todayDateString()
      // overrideSeconds is how the Complete-timer picker (see
      // CompleteTimerDialog) attributes time-to-beat to a specific
      // sub-category's own total instead of the game's main total. Passing
      // nothing (the Main choice, and every pre-existing call site) keeps
      // today's exact behavior: whatever profile.seconds is right now, i.e.
      // after the pause() above already committed the final elapsed time.
      profile.statusSeconds = overrideSeconds ?? profile.seconds
    }
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },
```

- [ ] **Step 5: Add IPC channel names**

In `src/shared/ipcContract.ts`, add five entries to the `profiles` object inside `export const IPC` (near `setStatus`, `setRating`):

```ts
    createSubCategory: 'profiles:createSubCategory',
    renameSubCategory: 'profiles:renameSubCategory',
    deleteSubCategory: 'profiles:deleteSubCategory',
    setSubCategoriesEnabled: 'profiles:setSubCategoriesEnabled',
    assignSubCategorySession: 'profiles:assignSubCategorySession',
```

Then update the preload API type block (the `profiles: { ... }` interface further down the same file) — change the existing `setStatus` line to:

```ts
    setStatus(name: string, status: Status, overrideSeconds?: number): Promise<Profile>
```

and add the five new method signatures right after it:

```ts
    createSubCategory(name: string, categoryName: string): Promise<Profile>
    renameSubCategory(name: string, categoryId: string, newName: string): Promise<Profile>
    deleteSubCategory(name: string, categoryId: string): Promise<Profile>
    setSubCategoriesEnabled(name: string, value: boolean | null): Promise<Profile>
    assignSubCategorySession(name: string, categoryId: string): Promise<Profile>
```

- [ ] **Step 6: Register the IPC handlers**

In `src/main/ipc/profiles.ipc.ts`, change the existing `setStatus` line to pass the third argument through:

```ts
  ipcMain.handle(IPC.profiles.setStatus, (_e, name, status, overrideSeconds?: number) =>
    profileService.setStatus(name, status, overrideSeconds)
  )
```

Then add five new handlers near it:

```ts
  ipcMain.handle(IPC.profiles.createSubCategory, (_e, name: string, categoryName: string) =>
    profileService.createSubCategory(name, categoryName)
  )
  ipcMain.handle(
    IPC.profiles.renameSubCategory,
    (_e, name: string, categoryId: string, newName: string) =>
      profileService.renameSubCategory(name, categoryId, newName)
  )
  ipcMain.handle(IPC.profiles.deleteSubCategory, (_e, name: string, categoryId: string) =>
    profileService.deleteSubCategory(name, categoryId)
  )
  ipcMain.handle(
    IPC.profiles.setSubCategoriesEnabled,
    (_e, name: string, value: boolean | null) => profileService.setSubCategoriesEnabled(name, value)
  )
  ipcMain.handle(IPC.profiles.assignSubCategorySession, (_e, name: string, categoryId: string) =>
    profileService.assignSubCategorySession(name, categoryId)
  )
```

- [ ] **Step 7: Expose via preload**

In `src/preload/index.ts`, change the existing `setStatus` line to:

```ts
    setStatus: (name, status, overrideSeconds) =>
      ipcRenderer.invoke(IPC.profiles.setStatus, name, status, overrideSeconds),
```

Then add five new lines near it, following the exact style of `setRating`:

```ts
    createSubCategory: (name, categoryName) =>
      ipcRenderer.invoke(IPC.profiles.createSubCategory, name, categoryName),
    renameSubCategory: (name, categoryId, newName) =>
      ipcRenderer.invoke(IPC.profiles.renameSubCategory, name, categoryId, newName),
    deleteSubCategory: (name, categoryId) =>
      ipcRenderer.invoke(IPC.profiles.deleteSubCategory, name, categoryId),
    setSubCategoriesEnabled: (name, value) =>
      ipcRenderer.invoke(IPC.profiles.setSubCategoriesEnabled, name, value),
    assignSubCategorySession: (name, categoryId) =>
      ipcRenderer.invoke(IPC.profiles.assignSubCategorySession, name, categoryId),
```

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Run the full unit suite**

Run: `npm run test`
Expected: all PASS — nothing here is unit-tested directly (it's thin IPC/service glue over the already-tested pure helpers); this is a regression check, not new coverage. Task 10's E2E script is what actually exercises this end to end.

- [ ] **Step 10: Commit**

```bash
git add src/main/store/profileService.ts src/shared/ipcContract.ts src/main/ipc/profiles.ipc.ts src/preload/index.ts
git commit -m "subcategories: profileService mutators, IPC wiring, setStatus override"
git push origin dev
```

---

### Task 4: Library Detail — the sub-category list

**Files:**
- Modify: `src/renderer/src/components/library/LibraryDetail.tsx`
- Modify: `src/renderer/src/components/library/LibraryTab.tsx`
- Modify: `src/renderer/src/locales/en/common.json`

**Interfaces:**
- Consumes: `window.api.profiles.{createSubCategory,renameSubCategory,deleteSubCategory,setSubCategoriesEnabled}` (Task 3), `useSettingsStore` (existing, for the global default).

- [ ] **Step 1: Add translation strings**

In `src/renderer/src/locales/en/common.json`, add these keys near `label_rating`:

```json
  "subcat_heading": "SUB-CATEGORIES",
  "subcat_new": "+ New",
  "subcat_new_name_prompt": "Sub-category name",
  "subcat_delete_confirm": "Delete \"{{name}}\"? Its {{time}} of tracked time is deleted too — this cannot be undone.",
  "subcat_enable_toggle": "Enable sub-categories for this game",
```

- [ ] **Step 2: Render the list**

In `src/renderer/src/components/library/LibraryDetail.tsx`, add the section right after the Rating block (after the closing `</div>` that follows the star-rating row, before the Genres block). First add three handler functions near `setRating` (around line 93):

```ts
  async function addSubCategory(): Promise<void> {
    const categoryName = window.prompt(t('subcat_new_name_prompt'))
    if (!categoryName || !categoryName.trim()) return
    useProfilesStore.getState().upsert(await window.api.profiles.createSubCategory(name, categoryName))
  }

  async function renameSubCategory(categoryId: string, currentName: string): Promise<void> {
    const newName = window.prompt(t('subcat_new_name_prompt'), currentName)
    if (!newName || !newName.trim() || newName === currentName) return
    useProfilesStore
      .getState()
      .upsert(await window.api.profiles.renameSubCategory(name, categoryId, newName))
  }

  async function deleteSubCategory(categoryId: string, categoryName: string, seconds: number): Promise<void> {
    if (!window.confirm(t('subcat_delete_confirm', { name: categoryName, time: formatSeconds(seconds) })))
      return
    useProfilesStore.getState().upsert(await window.api.profiles.deleteSubCategory(name, categoryId))
  }
```

(`window.prompt`/`window.confirm` match the existing convention already used by `handleDelete` in `LibraryTab.tsx` and `handleStop` above — no new dialog-plumbing needed for these three actions.)

Then the JSX, right after the Rating `</div>` (before the `{profile.genres.length > 0 && (...)}` block). Per the spec, this entire section is absent for a game with zero sub-categories — **including its own "+ New" button**; the way to create the FIRST one is a separate context-menu entry added in Step 3 below, not something living permanently on every game's page:

```tsx
          {profile.subCategories.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] tracking-wide text-subtext uppercase">
                  {t('subcat_heading')}
                </span>
                <button
                  onClick={() => void addSubCategory()}
                  className="text-xs text-accent hover:underline"
                >
                  {t('subcat_new')}
                </button>
              </div>
              <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-lg bg-card p-1.5">
                {profile.subCategories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded px-2 py-1 hover:bg-panel">
                    <button
                      onClick={() => void renameSubCategory(c.id, c.name)}
                      className="truncate text-left text-sm text-text hover:underline"
                    >
                      {c.name}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums text-subtext">{formatSeconds(c.seconds)}</span>
                      <button
                        onClick={() => void deleteSubCategory(c.id, c.name, c.seconds)}
                        className="text-xs text-red hover:underline"
                      >
                        {t('ctx_delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-subtext">
                <input
                  type="checkbox"
                  checked={profile.subCategoriesEnabled ?? true}
                  onChange={(e) =>
                    void (async () => {
                      useProfilesStore
                        .getState()
                        .upsert(
                          await window.api.profiles.setSubCategoriesEnabled(name, e.target.checked)
                        )
                    })()
                  }
                />
                {t('subcat_enable_toggle')}
              </label>
            </div>
          )}
```

This section's own "+ New" button (once it's showing at all) is for adding a *second, third, …* category — Step 3 covers the one-time "create the first one" path.

- [ ] **Step 3: First-category creation lives in the right-click menu, not the page**

A game with zero sub-categories must show nothing extra on its own page (Step 2 above), so the only way to create the first one is the context menu — the same place Task 8 will add "Show profile stats" for the ≥1 case. In `src/renderer/src/components/library/LibraryTab.tsx`, add to `menuItemsFor`, right after the `ctx_notes` entry, **unconditionally** (unlike "Show profile stats", this one has to work at zero):

```ts
      {
        label: t('ctx_new_subcategory'),
        onClick: () =>
          void (async () => {
            const categoryName = window.prompt(t('subcat_new_name_prompt'))
            if (!categoryName || !categoryName.trim()) return
            useProfilesStore
              .getState()
              .upsert(await window.api.profiles.createSubCategory(name, categoryName))
          })()
      },
```

Add the translation key alongside the others in this task:

```json
  "ctx_new_subcategory": "+ New sub-category",
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open a game with no sub-categories yet — confirm the Library Detail page shows nothing new. Right-click it, click "+ New sub-category", type a name — confirm the page now shows the section with that entry at 00:00:00. Click its name, rename it, confirm the new name shows. Use the page's own "+ New" to add a second one. Click Delete on one, confirm the browser `confirm()` dialog shows the right name and time, confirm it removes just that row. Toggle the enable checkbox, confirm it doesn't error. This is deliberately manual, not scripted — Task 10 adds the scripted version once the full flow (including actually crediting time) exists to verify against.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/library/LibraryDetail.tsx src/renderer/src/components/library/LibraryTab.tsx src/renderer/src/locales/en/common.json
git commit -m "subcategories: Library Detail list, first-category creation via context menu"
git push origin dev
```

---

### Task 5: Settings — global toggle

**Files:**
- Modify: `src/renderer/src/components/dialogs/SettingsDialog.tsx`
- Modify: `src/renderer/src/locales/en/common.json`

**Interfaces:**
- Consumes: `updateSettings` (existing, from `settingsStore.ts` — already generic over `Partial<Settings>`, no changes needed there).

- [ ] **Step 1: Add translation string**

Add to `common.json` near the other `label_*` settings keys:

```json
  "label_subcategories_enabled": "Enable sub-categories",
  "label_subcategories_enabled_hint": "Lets a game's time be broken down into named categories (e.g. a completionist run vs. a casual replay). Off doesn't delete any category's tracked time — it only stops new sessions from asking which one to credit.",
```

- [ ] **Step 2: Add the toggle**

In `src/renderer/src/components/dialogs/SettingsDialog.tsx`, inside the `{tab === 'games' && (...)}` block, add right after the `autoStartTimer` `ToggleRow` (the last one in that block, around line 150):

```tsx
          <div>
            <ToggleRow
              label={t('label_subcategories_enabled')}
              checked={settings.subCategoriesEnabled}
              onChange={(v) => void updateSettings({ subCategoriesEnabled: v })}
            />
            <div className="mt-1 text-xs text-subtext">{t('label_subcategories_enabled_hint')}</div>
          </div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/dialogs/SettingsDialog.tsx src/renderer/src/locales/en/common.json
git commit -m "subcategories: global enable/disable toggle in Settings → Games"
git push origin dev
```

---

### Task 6: The per-session prompt

**Files:**
- Create: `src/renderer/src/components/dialogs/SubCategoryPromptDialog.tsx`
- Modify: `src/renderer/src/state/uiStore.ts`
- Modify: `src/renderer/src/state/timerStore.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/locales/en/common.json`

**Interfaces:**
- Consumes: `window.api.profiles.assignSubCategorySession` (Task 3), `useProfilesStore`, `useSettingsStore`, `useUiStore.openDialog`.
- Produces: nothing further tasks depend on — this is a leaf feature.

- [ ] **Step 1: Add the `DialogKind` value**

In `src/renderer/src/state/uiStore.ts`, add `'subCategoryPrompt'` to the `DialogKind` union (this task only needs this one; Task 7 adds `'completeTimerPicker'`, Task 8 adds `'profileStatsPerGame'`):

```ts
export type DialogKind =
  | 'modify'
  | 'notes'
  | 'screenshots'
  | 'settings'
  | 'info'
  | 'add'
  | 'installed'
  | 'time'
  | 'subCategoryPrompt'
  | null
```

- [ ] **Step 2: Detect newly-started profiles in `timerStore`**

Replace `src/renderer/src/state/timerStore.ts` entirely with:

```ts
import { create } from 'zustand'
import { useProfilesStore } from './profilesStore'
import { useUiStore } from './uiStore'

interface TimerState {
  /** name -> live total seconds, pushed every 500ms by main. A name's presence here means it's running. */
  running: Record<string, number>
}

export const useTimerStore = create<TimerState>(() => ({ running: {} }))

let unsubscribe: (() => void) | null = null

/**
 * True once the first tick has been processed. Guards against treating
 * whatever is ALREADY running at subscribe-time (e.g. the renderer reloaded
 * while a game was mid-session) as "just started" — only a name that
 * genuinely wasn't in the previous tick counts.
 */
let hasBaseline = false
let previousRunning = new Set<string>()

function shouldPromptFor(name: string): boolean {
  const profile = useProfilesStore.getState().profiles[name]
  if (!profile || profile.subCategories.length === 0) return false
  const globalDefault = false // overwritten below once settingsStore is checked
  return profile.subCategoriesEnabled ?? globalDefault
}

export function startTimerTickSubscription(): void {
  if (unsubscribe) return
  unsubscribe = window.api.timer.onTick((payload) => {
    useTimerStore.setState({ running: payload.running })

    const nowRunning = new Set(Object.keys(payload.running))
    if (hasBaseline) {
      for (const name of nowRunning) {
        if (!previousRunning.has(name) && shouldPromptFor(name)) {
          // Don't steal focus from something the user already has open —
          // see the design spec's dialog-stacking note. The session still
          // defaults to Main (no prompt = no assignSubCategorySession call),
          // same as closing the prompt without answering.
          if (useUiStore.getState().dialog === null) {
            useUiStore.getState().openDialog('subCategoryPrompt', name)
          }
        }
      }
    }
    previousRunning = nowRunning
    hasBaseline = true
  })
}
```

- [ ] **Step 3: Fix the settings lookup**

The `shouldPromptFor` stub above has a placeholder `globalDefault = false` — replace it properly now (this was flagged deliberately rather than left silent, per the plan's own no-placeholder rule, so it's fixed in the same task rather than slipping through). Add the import and fix the function:

```ts
import { useSettingsStore } from './settingsStore'
```

```ts
function shouldPromptFor(name: string): boolean {
  const profile = useProfilesStore.getState().profiles[name]
  if (!profile || profile.subCategories.length === 0) return false
  const globalDefault = useSettingsStore.getState().settings?.subCategoriesEnabled ?? true
  return profile.subCategoriesEnabled ?? globalDefault
}
```

- [ ] **Step 4: Write the prompt dialog**

Create `src/renderer/src/components/dialogs/SubCategoryPromptDialog.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'

/**
 * Fires once per timer start (Play, or gameWatcher auto-start) for a game
 * that has ≥1 sub-category — see timerStore's shouldPromptFor. Answering
 * late is fine and expected: the timer never waits on this (see the design
 * spec), so "None" and "closed without answering" are the same outcome —
 * the session's time already landed in the main total the normal way either
 * way, this only decides whether it ALSO gets credited to one bucket.
 */
export function SubCategoryPromptDialog({
  name,
  onClose
}: {
  name: string
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  const [busy, setBusy] = useState(false)

  if (!profile) return null

  async function choose(categoryId: string | null): Promise<void> {
    if (categoryId === null) {
      onClose()
      return
    }
    setBusy(true)
    try {
      useProfilesStore
        .getState()
        .upsert(await window.api.profiles.assignSubCategorySession(name, categoryId))
    } finally {
      onClose()
    }
  }

  async function createAndChoose(): Promise<void> {
    const categoryName = window.prompt(t('subcat_new_name_prompt'))
    if (!categoryName || !categoryName.trim()) return
    setBusy(true)
    try {
      const updated = await window.api.profiles.createSubCategory(name, categoryName)
      useProfilesStore.getState().upsert(updated)
      const created = updated.subCategories[updated.subCategories.length - 1]
      await choose(created.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('subcat_prompt_title', { name })} onClose={() => void choose(null)}>
      <div className="flex flex-col gap-1.5">
        <button
          disabled={busy}
          onClick={() => void choose(null)}
          className="rounded-lg bg-card px-3 py-2 text-left text-sm text-text hover:bg-panel disabled:opacity-50"
        >
          {t('subcat_prompt_none')}
        </button>
        {profile.subCategories.map((c) => (
          <button
            key={c.id}
            disabled={busy}
            onClick={() => void choose(c.id)}
            className="rounded-lg bg-card px-3 py-2 text-left text-sm text-text hover:bg-panel disabled:opacity-50"
          >
            {c.name}
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => void createAndChoose()}
          className="rounded-lg bg-card px-3 py-2 text-left text-sm text-accent hover:bg-panel disabled:opacity-50"
        >
          {t('subcat_new')}
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 5: Mount it in App.tsx**

In `src/renderer/src/App.tsx`, add near the other `dialogTarget`-gated dialogs:

```tsx
      {dialog === 'subCategoryPrompt' && dialogTarget && (
        <SubCategoryPromptDialog name={dialogTarget} onClose={closeDialog} />
      )}
```

Add the import at the top alongside the other dialog imports.

- [ ] **Step 6: Add translation strings**

```json
  "subcat_prompt_title": "Which category is this session for, {{name}}?",
  "subcat_prompt_none": "None — just the main total",
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 8: Manual smoke check**

Run: `npm run dev`. Create a sub-category on a manually-added game (no real process needed — Play still works, it just won't auto-pause). Click Play. Confirm the prompt appears immediately. Wait ~10 seconds, then pick the sub-category. Confirm its listed time in Library Detail increased by roughly 10 seconds — not by the full main total. Click Play again, this time close the modal (✕ or click-outside) without choosing — confirm the sub-category's time does NOT change on the next check, only the main "Time Played" figure does.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/dialogs/SubCategoryPromptDialog.tsx src/renderer/src/state/uiStore.ts src/renderer/src/state/timerStore.ts src/renderer/src/App.tsx src/renderer/src/locales/en/common.json
git commit -m "subcategories: per-session prompt on timer start (manual Play + auto-start)"
git push origin dev
```

---

### Task 7: Complete button — which-timer picker

**Files:**
- Create: `src/renderer/src/components/dialogs/CompleteTimerDialog.tsx`
- Modify: `src/renderer/src/state/uiStore.ts`
- Modify: `src/renderer/src/components/library/LibraryDetail.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/locales/en/common.json`

**Interfaces:**
- Consumes: `window.api.profiles.setStatus(name, status, overrideSeconds?)` (Task 3, extended signature).

- [ ] **Step 1: Add the `DialogKind` value**

Add `'completeTimerPicker'` to the union in `uiStore.ts`, same spot as Task 6's addition.

- [ ] **Step 2: Change `toggleComplete` in LibraryDetail.tsx**

Replace the existing `toggleComplete` (around line 86):

```ts
  async function toggleComplete(): Promise<void> {
    const next: Status = profile!.status === 'completed' ? 'in_progress' : 'completed'
    if (next === 'completed' && profile!.subCategories.length > 0) {
      openDialog('completeTimerPicker', name)
      return
    }
    useProfilesStore.getState().upsert(await window.api.profiles.setStatus(name, next))
  }
```

(Un-completing, or completing a game with zero sub-categories, is untouched — exactly today's behavior, zero prompt.)

- [ ] **Step 3: Write the picker dialog**

Create `src/renderer/src/components/dialogs/CompleteTimerDialog.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { formatSeconds } from '@shared/format'

/**
 * Only ever opened when the game has ≥1 sub-category — see toggleComplete in
 * LibraryDetail.tsx. Picks which timer's CURRENT total becomes statusSeconds;
 * "Main" passes no override (today's exact existing behavior: profileService
 * reads profile.seconds itself, after its own pause()).
 */
export function CompleteTimerDialog({
  name,
  onClose
}: {
  name: string
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])

  if (!profile) return null

  async function complete(overrideSeconds?: number): Promise<void> {
    useProfilesStore
      .getState()
      .upsert(await window.api.profiles.setStatus(name, 'completed', overrideSeconds))
    onClose()
  }

  return (
    <Modal title={t('complete_timer_picker_title')} onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => void complete(undefined)}
          className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-left text-sm text-text hover:bg-panel"
        >
          <span>{t('complete_timer_picker_main')}</span>
          <span className="tabular-nums text-subtext">{formatSeconds(profile.seconds)}</span>
        </button>
        {profile.subCategories.map((c) => (
          <button
            key={c.id}
            onClick={() => void complete(c.seconds)}
            className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-left text-sm text-text hover:bg-panel"
          >
            <span>{c.name}</span>
            <span className="tabular-nums text-subtext">{formatSeconds(c.seconds)}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Mount it in App.tsx**

```tsx
      {dialog === 'completeTimerPicker' && dialogTarget && (
        <CompleteTimerDialog name={dialogTarget} onClose={closeDialog} />
      )}
```

- [ ] **Step 5: Add translation strings**

```json
  "complete_timer_picker_title": "Which timer's time counts as the completion time?",
  "complete_timer_picker_main": "Main",
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Manual smoke check**

Add a sub-category, let some time accrue on it (via Task 6's prompt), then press Complete. Confirm the picker shows Main and the sub-category with their current, different totals. Pick the sub-category. Confirm More Info / the Time to Beat stat now shows the sub-category's total, not Main's.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/dialogs/CompleteTimerDialog.tsx src/renderer/src/state/uiStore.ts src/renderer/src/components/library/LibraryDetail.tsx src/renderer/src/App.tsx src/renderer/src/locales/en/common.json
git commit -m "subcategories: Complete button asks which timer's time to use, when applicable"
git push origin dev
```

---

### Task 8: Right-click "Show profile stats" + Genres column removal

**Files:**
- Create: `src/renderer/src/components/dialogs/ProfileStatsPerGameDialog.tsx`
- Modify: `src/renderer/src/state/uiStore.ts`
- Modify: `src/renderer/src/components/library/LibraryTab.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/datatab/DataTab.tsx`
- Modify: `src/renderer/src/locales/en/common.json`

**Interfaces:**
- Consumes: nothing new — reads `Profile.subCategories`/`seconds` already in the store.

- [ ] **Step 1: Add the `DialogKind` value**

Add `'profileStatsPerGame'` to the union in `uiStore.ts`.

- [ ] **Step 2: Add the context-menu item**

In `src/renderer/src/components/library/LibraryTab.tsx`'s `menuItemsFor`, add right after the `ctx_notes` entry:

```ts
      ...(profile && profile.subCategories.length > 0
        ? [{ label: t('ctx_show_profile_stats'), onClick: () => openDialog('profileStatsPerGame', name) }]
        : []),
```

- [ ] **Step 3: Write the stats dialog**

Create `src/renderer/src/components/dialogs/ProfileStatsPerGameDialog.tsx`, following the percent-bar treatment already established in `ProfileStatsTab.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { formatSeconds } from '@shared/format'

function Bar({ label, seconds, percent }: { label: string; seconds: number; percent: number }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm text-text">
        <span>{label}</span>
        <span className="tabular-nums text-subtext">
          {formatSeconds(seconds)} ({percent}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-card">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(percent > 0 ? 2 : 0, percent)}%` }}
        />
      </div>
    </div>
  )
}

export function ProfileStatsPerGameDialog({
  name,
  onClose
}: {
  name: string
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])

  if (!profile) return null

  const total = profile.seconds
  const categorized = profile.subCategories.reduce((sum, c) => sum + c.seconds, 0)
  const untagged = Math.max(0, total - categorized)
  const pct = (s: number): number => (total > 0 ? Math.round((s / total) * 100) : 0)

  return (
    <Modal title={t('profile_stats_per_game_title', { name })} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {profile.subCategories.map((c) => (
          <Bar key={c.id} label={c.name} seconds={c.seconds} percent={pct(c.seconds)} />
        ))}
        <Bar label={t('profile_stats_per_game_untagged')} seconds={untagged} percent={pct(untagged)} />
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Mount it in App.tsx**

```tsx
      {dialog === 'profileStatsPerGame' && dialogTarget && (
        <ProfileStatsPerGameDialog name={dialogTarget} onClose={closeDialog} />
      )}
```

- [ ] **Step 5: Remove the Genres column from Advanced Game Stats**

In `src/renderer/src/components/datatab/DataTab.tsx`, delete this line (around line 195):

```tsx
              {advanced && <th className="px-3 py-2 font-medium">{t('col_genres')}</th>}
```

and this block (around line 248-252):

```tsx
                  {advanced && (
                    <td className="px-3 py-2 text-subtext">
                      {p.genres.map((g) => t(g, { ns: 'genres' })).join(', ')}
                    </td>
                  )}
```

- [ ] **Step 6: Add translation strings**

```json
  "ctx_show_profile_stats": "Show profile stats",
  "profile_stats_per_game_title": "{{name}} — time by category",
  "profile_stats_per_game_untagged": "Untagged",
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 8: Manual smoke check**

Right-click a game with ≥1 sub-category, confirm "Show profile stats" appears (and is absent for a game with none). Open it, confirm the percentages are sane (sum to ~100% given untagged is included) and match the numbers in Library Detail's own list. Open Game Stats, toggle Advanced, confirm no Genres column appears.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/dialogs/ProfileStatsPerGameDialog.tsx src/renderer/src/state/uiStore.ts src/renderer/src/components/library/LibraryTab.tsx src/renderer/src/App.tsx src/renderer/src/components/datatab/DataTab.tsx src/renderer/src/locales/en/common.json
git commit -m "subcategories: per-game profile-stats window; drop Genres from Advanced Game Stats"
git push origin dev
```

---

### Task 9: Version bump

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Bump**

Follow the project's exact existing convention (see recent `git log --oneline | grep "dev: bump"`): bump the patch or minor version in `package.json`, then run:

```bash
npm version <new-version> --no-git-tag-version --allow-same-version
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "dev: bump to <new-version>"
git push origin dev
```

---

### Task 10: Real-app E2E verification

**Files:**
- Create: `scripts/verify-subcategories.cjs`

**⚠️ Before writing or running anything in this task, re-read the Global Constraints section above — back up the real save file and confirm the `GAMUT_TEST_APPDATA` patch before the first script execution.**

- [ ] **Step 1: Back up real data**

```bash
cp "$APPDATA/gametimer-dev/game_timer_data.json" "$APPDATA/gametimer-dev/game_timer_data.PRE-SUBCATEGORIES-BACKUP.json"
```

(On Windows, `$APPDATA` expands under Git Bash; if it doesn't, use the literal path `C:\Users\<you>\AppData\Roaming\gametimer-dev\game_timer_data.json`.)

- [ ] **Step 2: Build and confirm the isolation patch**

```bash
npm run build
grep -c GAMUT_TEST_APPDATA out/main/index.js
```

Expected: the grep returns `1` or more. If it returns `0`, do NOT proceed to Step 4 — first run any one self-patching script (e.g. `node scripts/verify-keybinds-screenshots-overlay.cjs`) to apply the patch, then re-run the grep to confirm before continuing.

- [ ] **Step 3: Write the E2E script**

Create `scripts/verify-subcategories.cjs`, following `verify-keybinds-screenshots-overlay.cjs`'s exact structure (self-patching `ensureBundlePatched()`, isolated `GAMUT_TEST_APPDATA`, `check()` helper, `closeApp()` with `taskkill /T`):

```js
/*
 * Sub-categories: create/rename/delete, session crediting (including the
 * "answered late" case), the Complete-button timer picker, and the
 * enable/disable toggle preserving history. Driven through real UI clicks
 * per project convention — see feedback-test-via-real-ui memory.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-subcategories-tmp')
const ROOT = path.join(SCRATCH, 'gametimer-dev')
const BUNDLE = path.join(__dirname, '..', 'out', 'main', 'index.js')

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`
  )
}

function ensureBundlePatched() {
  const original = fs.readFileSync(BUNDLE, 'utf8')
  const patchedTarget = 'process.env.GAMUT_TEST_APPDATA || electron.app.getPath("appData")'
  if (original.includes(patchedTarget)) return
  const target = 'electron.app.getPath("appData")'
  if (!original.includes(target)) {
    throw new Error(`Could not find ${JSON.stringify(target)} in ${BUNDLE} to patch.`)
  }
  fs.writeFileSync(BUNDLE, original.replace(target, `(${patchedTarget})`))
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
    favorite: false, coverFile: null, subCategories: [], subCategoriesEnabled: null,
    ...extra
  }
}

function seed(label) {
  const appDataRoot = path.join(ROOT, label)
  const userDataDir = path.join(appDataRoot, 'gametimer-dev')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(path.join(userDataDir, 'firstrun.json'), JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' }))
  fs.writeFileSync(
    path.join(userDataDir, 'game_timer_data.json'),
    JSON.stringify({
      profiles: { 'Sub Test Game': game('Sub Test Game') },
      lastSelected: 'Sub Test Game',
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en', subCategoriesEnabled: true }
    })
  )
  return appDataRoot
}

const readProfile = (appDataRoot) =>
  JSON.parse(fs.readFileSync(path.join(appDataRoot, 'gametimer-dev', 'game_timer_data.json'), 'utf8'))
    .profiles['Sub Test Game']

async function launch(label) {
  const appDataRoot = seed(label)
  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, GAMUT_TEST_APPDATA: appDataRoot }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1000)
  return { app, win, appDataRoot }
}

async function closeApp(app) {
  const pid = app.process().pid
  await new Promise((resolve) => {
    require('child_process').execFile('taskkill', ['/F', '/T', '/PID', String(pid)], () => resolve())
  })
  await new Promise((r) => setTimeout(r, 500))
}

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  ensureBundlePatched()

  console.log('\n=== create, rename, delete a sub-category ===')
  {
    const { app, win, appDataRoot } = await launch('crud')
    await win.locator('text=Sub Test Game').click()

    // Create — window.prompt is not interceptable by Playwright directly;
    // route through the IPC the button calls, same trust level as clicking
    // it (this is real app code executing, not a mock).
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', '100% Completion'))
    await win.waitForTimeout(300)
    let profile = readProfile(appDataRoot)
    check('sub-category created', profile.subCategories.length, 1)
    check('starts at zero seconds', profile.subCategories[0].seconds, 0)

    const id = profile.subCategories[0].id
    await win.evaluate((id) => window.api.profiles.renameSubCategory('Sub Test Game', id, 'Casual'), id)
    await win.waitForTimeout(300)
    profile = readProfile(appDataRoot)
    check('renamed', profile.subCategories[0].name, 'Casual')

    await win.evaluate((id) => window.api.profiles.deleteSubCategory('Sub Test Game', id), id)
    await win.waitForTimeout(300)
    profile = readProfile(appDataRoot)
    check('deleted', profile.subCategories.length, 0)

    await closeApp(app)
  }

  console.log('\n=== a session answered immediately credits the right delta ===')
  {
    const { app, win, appDataRoot } = await launch('immediate')
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', 'Casual'))
    await win.evaluate(() => window.api.timer.start('Sub Test Game'))
    await win.waitForTimeout(2500)
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate((id) => window.api.profiles.assignSubCategorySession('Sub Test Game', id), id)
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('sub-category credited roughly the elapsed time (2-4s)', profile.subCategories[0].seconds >= 2 && profile.subCategories[0].seconds <= 4, true)
    check('main total also reflects it', profile.seconds >= 2, true)
    await closeApp(app)
  }

  console.log('\n=== answering LATE (after pause) still credits correctly, without syncing to the full main total ===')
  {
    const { app, win, appDataRoot } = await launch('late')
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', 'Casual'))
    // Give the game an unrelated existing main total, matching the user's own
    // "main at 1 hour already" scenario from the design conversation.
    await win.evaluate(() => window.api.profiles.addRemoveTime('Sub Test Game', 3600))
    await win.evaluate(() => window.api.timer.start('Sub Test Game'))
    await win.waitForTimeout(2000)
    await win.evaluate(() => window.api.timer.pause('Sub Test Game'))
    // Answer well after pausing — the pending snapshot must survive this.
    await win.waitForTimeout(500)
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate((id) => window.api.profiles.assignSubCategorySession('Sub Test Game', id), id)
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check(
      'credited only the session delta (~2s), never resynced to the full 3600s main total',
      profile.subCategories[0].seconds < 10,
      true
    )
    await closeApp(app)
  }

  console.log('\n=== Complete picks a sub-category\'s own time as statusSeconds ===')
  {
    const { app, win, appDataRoot } = await launch('complete')
    await win.evaluate(() => window.api.profiles.addRemoveTime('Sub Test Game', 5000))
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', '100%'))
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate(() => window.api.timer.start('Sub Test Game'))
    await win.waitForTimeout(1500)
    await win.evaluate((id) => window.api.profiles.assignSubCategorySession('Sub Test Game', id), id)
    await win.evaluate(() => window.api.timer.pause('Sub Test Game'))
    const categorySeconds = readProfile(appDataRoot).subCategories[0].seconds

    await win.evaluate((id) => window.api.profiles.setStatus('Sub Test Game', 'completed', categorySeconds), categorySeconds)
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('statusSeconds matches the chosen sub-category, not the main total', profile.statusSeconds, categorySeconds)
    check('statusSeconds is NOT the main total', profile.statusSeconds !== profile.seconds, true)
    await closeApp(app)
  }

  console.log('\n=== disabling sub-categories preserves existing data ===')
  {
    const { app, win, appDataRoot } = await launch('disable')
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', 'Casual'))
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate((id) => window.api.profiles.renameSubCategory('Sub Test Game', id, 'Casual Run'), id)
    await win.evaluate(() => window.api.profiles.setSubCategoriesEnabled('Sub Test Game', false))
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('disabling does not delete the sub-category', profile.subCategories.length, 1)
    check('name survives', profile.subCategories[0].name, 'Casual Run')
    check('enabled flag is false, not null', profile.subCategoriesEnabled, false)
    await closeApp(app)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 4: Run it**

```bash
node scripts/verify-subcategories.cjs
```

Expected: `ALL CHECKS PASSED`. If anything fails, fix the implementation (not the test) unless the test itself is wrong — re-read the failure message, it names the exact expected vs. actual.

- [ ] **Step 5: Confirm the real save file is untouched**

```bash
diff "$APPDATA/gametimer-dev/game_timer_data.json" "$APPDATA/gametimer-dev/game_timer_data.PRE-SUBCATEGORIES-BACKUP.json"
```

Expected: no output (files identical). If they differ, STOP — this means isolation failed silently despite the Step 2 check, treat it exactly as seriously as the 2026-08-14 incident and restore from the backup before doing anything else.

- [ ] **Step 6: Add to `.gitignore`**

Confirm `.verify-subcategories-tmp/` is covered — it isn't yet. Add it to `.gitignore` next to the other `.verify-*-tmp/` entries.

- [ ] **Step 7: Run the full existing test suite once more as a regression check**

```bash
npm run test
npm run typecheck
```

Expected: both clean — nothing in this feature should have touched any other subsystem's behavior.

- [ ] **Step 8: Commit**

```bash
git add scripts/verify-subcategories.cjs .gitignore
git commit -m "subcategories: real-app E2E — CRUD, delayed crediting, Complete picker, disable-preserves-data"
git push origin dev
```

---

## Self-Review

**Spec coverage:** every section of the design doc maps to a task — data model (1), the no-timer-changes mechanism (2, 3), the sub-category list (4), settings toggle (5), the per-session prompt including late-answer and close-without-answering (6), the Complete-button picker (7), the profile-stats window and Genres removal (8), and the whole thing verified live (10).

**Placeholder scan:** Task 6 Step 2 deliberately ships a placeholder (`globalDefault = false`) and Step 3 fixes it in the same task, with an explicit note about why — this is not a plan-author TODO, it's the plan modeling a same-task fix-forward, and Step 3 contains the real code. No other placeholders present.

**Internal consistency (caught on this pass):** Task 4's first draft made the sub-category heading and "+ New" button render unconditionally on every game's page, to solve "how do you create the first one." That directly contradicts the approved spec's "zero sub-categories → this section doesn't render at all — no visual change for anyone not using the feature." Fixed by moving first-category creation to an always-available right-click "+ New sub-category" entry (Task 4 Step 3, in `LibraryTab.tsx`) and reverting Library Detail's own section back to being fully gated on `subCategories.length > 0`, with its in-section "+ New" only ever needed for a second-or-later category.

**Type consistency:** `SubCategory { id, name, seconds }` is identical across `types.ts`, `subCategories.ts`, `schema.ts`, and every dialog. `setStatus`'s signature (`name, status, overrideSeconds?`) is consistent across `profileService.ts`, `ipcContract.ts`, `profiles.ipc.ts`, and `preload/index.ts`. `assignSubCategorySession(name, categoryId)` matches everywhere it's called (Task 6's prompt, Task 10's script).

**Scope check:** ten tasks, each independently testable, each producing a working and committable slice — this did not need decomposing into separate plans, it's one feature with one clear boundary.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-14-subcategories.md`.** Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
