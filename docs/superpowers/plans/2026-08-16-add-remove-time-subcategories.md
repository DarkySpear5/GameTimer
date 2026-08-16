# Add/Remove Time Sub-category Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Add/Remove Time feature so removing (and adding) time can also credit a game's sub-categories, and replace the Time tab's single-step form with a two-step flow: enter the amount, then (only if the game has sub-categories) choose which ones also get it.

**Architecture:** `TimeTab` gains a `step` state machine (`'amount' | 'categories'`) — step 1 is today's existing toggle + Hours/Minutes inputs unchanged, step 2 is a new tickable checklist that only ever renders when `profile.subCategories.length > 0`. `addRemoveTime` gains an optional third parameter, `subCategoryIds: string[]`, threaded through the IPC contract; main always receives the full delta, and each listed sub-category receives the identical delta via `creditSubCategory`, which is being extended to support negative deltas (clamped at 0) for the first time.

**Tech Stack:** Electron + React 19 + TypeScript, Zustand for renderer state, react-i18next for the 10 shipped locales, Vitest for unit tests, Playwright's `_electron` launcher for real-app E2E scripts.

## Global Constraints

- Work happens on the `dev` branch. Commit and push directly to `dev` after each task — this repo does not use a worktree/PR flow.
- Never touch `main` as part of this plan. Merging `dev` to `main` only happens on the user's explicit instruction, in a separate step after this plan is done.
- Every new user-facing string needs a translated entry in all 10 locale files: `src/renderer/src/locales/{en,fr,es,de,it,pt,ja,zh,ko,ru}/common.json`. Never leave a key untranslated or duplicate the English text into another locale as a placeholder.
- **Before calling Playwright's `_electron.launch()` for ANY reason — including a one-off throwaway script — back up both real save files first:**
  `%APPDATA%\gametimer-dev\game_timer_data.json` and `%APPDATA%\gametimer\game_timer_data.json`. Then confirm the exact literal `process.env.GAMUT_TEST_APPDATA || electron.app.getPath("appData")` is present in `out/main/index.js` (patch it if missing, exactly as `scripts/verify-subcategories.cjs`'s `ensureBundlePatched()` does) before launching. A bare `grep -c GAMUT_TEST_APPDATA` is not sufficient — that string appears in unrelated code too. This exact oversight destroyed real save data earlier in this project's history; there are no exceptions to this step.
- Never run automation against the stable-channel install (`%APPDATA%\gametimer\`) beyond what the established E2E scripts already do in their own isolated `GAMUT_TEST_APPDATA` scratch directories — it holds the user's real SteamGridDB API key.
- `npm run typecheck` and `npm test` (Vitest) must stay green after every task's commit.

---

### Task 1: Add the new translation keys (all 10 locales)

**Files:**
- Modify: `src/renderer/src/locales/en/common.json:39`
- Modify: `src/renderer/src/locales/fr/common.json:36`
- Modify: `src/renderer/src/locales/es/common.json:36`
- Modify: `src/renderer/src/locales/de/common.json:36`
- Modify: `src/renderer/src/locales/it/common.json:36`
- Modify: `src/renderer/src/locales/pt/common.json:36`
- Modify: `src/renderer/src/locales/ja/common.json:36`
- Modify: `src/renderer/src/locales/zh/common.json:36`
- Modify: `src/renderer/src/locales/ko/common.json:36`
- Modify: `src/renderer/src/locales/ru/common.json:36`

**Interfaces:**
- Produces: five i18n keys that Task 4 calls via `t(...)`: `addtime_continue`, `addtime_step2_question`, `addtime_select_all`, `addtime_select_none`, `addtime_main_note`. No other task depends on anything else from this one.

Every locale file has the line `"add_use_this": "..."` (English at line 39, all other locales at line 36 — confirmed identical position across all 10 files). Insert the five new keys immediately after that line, before whatever line follows it (`"btn_add_game": ...` in every locale). This keeps them grouped near the other feature-scoped keys already living outside strict alphabetical order in this file (e.g. `subcat_*`, `installed_scan_*`) — the file is loosely, not strictly, sorted.

- [ ] **Step 1: Insert the five keys into `en/common.json`**

Find this line (line 39):
```json
  "add_use_this": "Use this",
```
Insert immediately after it:
```json
  "addtime_continue": "Continue →",
  "addtime_main_note": "The main total always gets the full amount.",
  "addtime_select_all": "Select all",
  "addtime_select_none": "Select none",
  "addtime_step2_question": "Apply this change to which categories?",
```

- [ ] **Step 2: Insert the five keys into `fr/common.json`**

Find this line (line 36):
```json
  "add_use_this": "Utiliser",
```
Insert immediately after it:
```json
  "addtime_continue": "Continuer →",
  "addtime_main_note": "Le total principal reçoit toujours le montant complet.",
  "addtime_select_all": "Tout sélectionner",
  "addtime_select_none": "Tout désélectionner",
  "addtime_step2_question": "Appliquer ce changement à quelles catégories ?",
```

- [ ] **Step 3: Insert the five keys into `es/common.json`**

Find this line (line 36):
```json
  "add_use_this": "Usar este",
```
Insert immediately after it:
```json
  "addtime_continue": "Continuar →",
  "addtime_main_note": "El total principal siempre recibe la cantidad completa.",
  "addtime_select_all": "Seleccionar todo",
  "addtime_select_none": "No seleccionar ninguno",
  "addtime_step2_question": "¿A qué categorías aplicar este cambio?",
```

- [ ] **Step 4: Insert the five keys into `de/common.json`**

Find this line (line 36):
```json
  "add_use_this": "Übernehmen",
```
Insert immediately after it:
```json
  "addtime_continue": "Weiter →",
  "addtime_main_note": "Die Hauptgesamtzeit erhält immer den vollen Betrag.",
  "addtime_select_all": "Alle auswählen",
  "addtime_select_none": "Keine auswählen",
  "addtime_step2_question": "Auf welche Kategorien soll diese Änderung angewendet werden?",
```

- [ ] **Step 5: Insert the five keys into `it/common.json`**

Find this line (line 36):
```json
  "add_use_this": "Usa questo",
```
Insert immediately after it:
```json
  "addtime_continue": "Continua →",
  "addtime_main_note": "Il totale principale riceve sempre l'importo completo.",
  "addtime_select_all": "Seleziona tutto",
  "addtime_select_none": "Deseleziona tutto",
  "addtime_step2_question": "A quali categorie applicare questa modifica?",
```

- [ ] **Step 6: Insert the five keys into `pt/common.json`**

Find this line (line 36):
```json
  "add_use_this": "Usar este",
```
Insert immediately after it:
```json
  "addtime_continue": "Continuar →",
  "addtime_main_note": "O total principal sempre recebe o valor completo.",
  "addtime_select_all": "Selecionar tudo",
  "addtime_select_none": "Não selecionar nenhum",
  "addtime_step2_question": "Aplicar esta alteração a quais categorias?",
```

- [ ] **Step 7: Insert the five keys into `ja/common.json`**

Find this line (line 36):
```json
  "add_use_this": "これを使う",
```
Insert immediately after it:
```json
  "addtime_continue": "次へ →",
  "addtime_main_note": "メインの合計には常に全量が適用されます。",
  "addtime_select_all": "すべて選択",
  "addtime_select_none": "選択解除",
  "addtime_step2_question": "この変更をどのカテゴリーに適用しますか？",
```

- [ ] **Step 8: Insert the five keys into `zh/common.json`**

Find this line (line 36):
```json
  "add_use_this": "就用这个",
```
Insert immediately after it:
```json
  "addtime_continue": "继续 →",
  "addtime_main_note": "主计时总是获得完整的时长。",
  "addtime_select_all": "全选",
  "addtime_select_none": "全不选",
  "addtime_step2_question": "将此更改应用到哪些分类？",
```

- [ ] **Step 9: Insert the five keys into `ko/common.json`**

Find this line (line 36):
```json
  "add_use_this": "이것으로 하기",
```
Insert immediately after it:
```json
  "addtime_continue": "계속 →",
  "addtime_main_note": "메인 총계에는 항상 전체 양이 적용됩니다.",
  "addtime_select_all": "모두 선택",
  "addtime_select_none": "모두 해제",
  "addtime_step2_question": "이 변경 사항을 어떤 카테고리에 적용할까요?",
```

- [ ] **Step 10: Insert the five keys into `ru/common.json`**

Find this line (line 36):
```json
  "add_use_this": "Использовать",
```
Insert immediately after it:
```json
  "addtime_continue": "Далее →",
  "addtime_main_note": "Общий итог всегда получает всю сумму целиком.",
  "addtime_select_all": "Выбрать все",
  "addtime_select_none": "Снять выбор",
  "addtime_step2_question": "К каким категориям применить это изменение?",
```

- [ ] **Step 11: Verify every file is still valid JSON and has all five keys**

Run (from the repo root):
```bash
node -e "
const fs = require('fs');
const locales = ['en','fr','es','de','it','pt','ja','zh','ko','ru'];
const keys = ['addtime_continue','addtime_main_note','addtime_select_all','addtime_select_none','addtime_step2_question'];
for (const loc of locales) {
  const path = \`src/renderer/src/locales/\${loc}/common.json\`;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  for (const key of keys) {
    if (!(key in data)) throw new Error(\`\${loc}: missing \${key}\`);
  }
  console.log(\`OK  \${loc}\`);
}
console.log('All locales valid and complete.');
"
```
Expected: `OK` printed for all 10 locales, then `All locales valid and complete.` with exit code 0. If any file fails to parse, the error will name which file and where.

- [ ] **Step 12: Commit**

```bash
git add src/renderer/src/locales
git commit -m "i18n: add Add/Remove Time sub-category strings for all 10 locales"
git push origin dev
```

---

### Task 2: Make `creditSubCategory` bidirectional

**Files:**
- Modify: `src/shared/subCategories.ts`
- Test: `src/shared/subCategories.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `creditSubCategory(subCategories: SubCategory[], id: string, deltaSeconds: number): SubCategory[]` — same signature as today, but now a negative `deltaSeconds` subtracts, clamped at 0, instead of being a no-op. Task 3's `addRemoveTime` calls this directly with a signed delta.

- [ ] **Step 1: Write the failing tests**

Open `src/shared/subCategories.test.ts`. Replace this existing test:
```ts
  it('is a no-op for a zero or negative delta', () => {
    expect(creditSubCategory(base, 'a', 0)).toBe(base)
    expect(creditSubCategory(base, 'a', -5)).toBe(base)
  })
```
with these four:
```ts
  it('is a no-op for a zero delta', () => {
    expect(creditSubCategory(base, 'a', 0)).toBe(base)
  })

  it('subtracts a negative delta from the matching category', () => {
    const withSome = creditSubCategory(base, 'a', 1800) // 30:00
    const result = creditSubCategory(withSome, 'a', -600) // -10:00
    expect(result.find((c) => c.id === 'a')?.seconds).toBe(1200) // 20:00
  })

  it('clamps a negative delta at zero rather than going negative', () => {
    const withSome = creditSubCategory(base, 'a', 300) // 5:00
    const result = creditSubCategory(withSome, 'a', -600) // removing more than it has
    expect(result.find((c) => c.id === 'a')?.seconds).toBe(0)
  })

  it('is a no-op for a negative delta on an unknown id', () => {
    expect(creditSubCategory(base, 'nonexistent', -60)).toBe(base)
  })
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/shared/subCategories.test.ts`
Expected: FAIL — the two new subtraction tests fail because the current implementation still early-returns (`if (deltaSeconds <= 0) return subCategories`) for any negative delta, so the category's `seconds` never changes.

- [ ] **Step 3: Rewrite `creditSubCategory`**

In `src/shared/subCategories.ts`, replace the whole function (and its doc comment) with:
```ts
/**
 * Adds (or, for a negative delta, subtracts) `deltaSeconds` from one
 * sub-category's own total. Never mutates — returns a new array, matching
 * how `profile.subCategories = creditSubCategory(...)` is reassigned at
 * every call site.
 *
 * A delta of exactly zero, or an id that doesn't match any category, is a
 * no-op that returns the input array unchanged (not a copy) — this is what
 * lets a session where nothing measurable happened, or a category deleted
 * out from under a still-pending prompt, fail silently instead of throwing.
 *
 * A negative delta that would take a category below zero clamps at zero
 * instead, matching the floor `addRemoveTime` already enforces on the main
 * total. Each category clamps independently — removing more than one
 * category has never affects any other category, or how much the main
 * total itself loses.
 */
export function creditSubCategory(
  subCategories: SubCategory[],
  id: string,
  deltaSeconds: number
): SubCategory[] {
  if (deltaSeconds === 0) return subCategories
  if (!subCategories.some((c) => c.id === id)) return subCategories
  return subCategories.map((c) =>
    c.id === id ? { ...c, seconds: Math.max(0, c.seconds + deltaSeconds) } : c
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/subCategories.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/subCategories.ts src/shared/subCategories.test.ts
git commit -m "Make creditSubCategory bidirectional, clamped at zero on removal"
git push origin dev
```

---

### Task 3: Thread `subCategoryIds` through `addRemoveTime` and its IPC path

**Files:**
- Modify: `src/main/store/profileService.ts:588-601`
- Modify: `src/shared/ipcContract.ts:225`
- Modify: `src/preload/index.ts:46`
- Modify: `src/main/ipc/profiles.ipc.ts:58-60`

**Interfaces:**
- Consumes: `creditSubCategory` from Task 2 (already imported into `profileService.ts` — see its existing `import { newSubCategory, creditSubCategory } from '@shared/subCategories'` line; no new import needed).
- Produces: `window.api.profiles.addRemoveTime(name: string, deltaSeconds: number, subCategoryIds?: string[]): Promise<Profile>`. The third parameter is optional and defaults to `[]` at the `profileService` layer, so every existing call site (Task 4's current, not-yet-rewritten `TimeTab`, and `scripts/verify-subcategories.cjs`'s two-argument `addRemoveTime('Sub Test Game', 3600)` call) keeps compiling and behaving exactly as it does today without any changes in this task. Task 4 is the only place that will pass a real array.

No test file exists for `profileService.ts` today — none of its other mutators are unit-tested; they're covered end-to-end by the real-app scripts in `scripts/`, because `profileService` is tightly coupled to `dataStore`'s on-disk persistence. This task follows that same pattern: its correctness is verified by Task 6's E2E script, not a new unit test.

- [ ] **Step 1: Update the IPC contract's type signature**

In `src/shared/ipcContract.ts`, find (line 225):
```ts
    addRemoveTime(name: string, deltaSeconds: number): Promise<Profile>
```
Replace with:
```ts
    addRemoveTime(name: string, deltaSeconds: number, subCategoryIds?: string[]): Promise<Profile>
```

- [ ] **Step 2: Update the preload bridge**

In `src/preload/index.ts`, find (line 46):
```ts
    addRemoveTime: (name, deltaSeconds) => ipcRenderer.invoke(IPC.profiles.addRemoveTime, name, deltaSeconds),
```
Replace with:
```ts
    addRemoveTime: (name, deltaSeconds, subCategoryIds) =>
      ipcRenderer.invoke(IPC.profiles.addRemoveTime, name, deltaSeconds, subCategoryIds),
```

- [ ] **Step 3: Update the main-process IPC handler**

In `src/main/ipc/profiles.ipc.ts`, find (lines 58-60):
```ts
  ipcMain.handle(IPC.profiles.addRemoveTime, (_e, name, deltaSeconds) =>
    profileService.addRemoveTime(name, deltaSeconds)
  )
```
Replace with:
```ts
  ipcMain.handle(IPC.profiles.addRemoveTime, (_e, name, deltaSeconds, subCategoryIds) =>
    profileService.addRemoveTime(name, deltaSeconds, subCategoryIds)
  )
```

- [ ] **Step 4: Update `profileService.addRemoveTime` itself**

In `src/main/store/profileService.ts`, find (lines 588-601):
```ts
  async addRemoveTime(name: string, deltaSeconds: number): Promise<Profile> {
    const profile = requireProfile(name)
    const removing = deltaSeconds < 0
    const magnitude = Math.abs(deltaSeconds)
    if (removing) {
      profile.seconds = Math.max(0, profile.seconds - magnitude)
    } else {
      profile.seconds += magnitude
      profile.lastPlayed = Date.now()
    }
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },
```
Replace with:
```ts
  async addRemoveTime(name: string, deltaSeconds: number, subCategoryIds: string[] = []): Promise<Profile> {
    const profile = requireProfile(name)
    const removing = deltaSeconds < 0
    const magnitude = Math.abs(deltaSeconds)
    if (removing) {
      profile.seconds = Math.max(0, profile.seconds - magnitude)
    } else {
      profile.seconds += magnitude
      profile.lastPlayed = Date.now()
    }
    for (const id of subCategoryIds) {
      profile.subCategories = creditSubCategory(profile.subCategories, id, deltaSeconds)
    }
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },
```
Note main's own clamp/`lastPlayed` logic is untouched — every id in `subCategoryIds` receives the exact same signed `deltaSeconds` main just received, clamped independently per category inside `creditSubCategory`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. `TimeTab`'s existing two-argument call and the E2E script's two-argument call both still satisfy the now-optional third parameter.

- [ ] **Step 6: Commit**

```bash
git add src/main/store/profileService.ts src/shared/ipcContract.ts src/preload/index.ts src/main/ipc/profiles.ipc.ts
git commit -m "Thread subCategoryIds through addRemoveTime's IPC path"
git push origin dev
```

---

### Task 4: Rework `TimeTab` into the two-step flow

**Files:**
- Modify: `src/renderer/src/components/dialogs/ModifyDialog.tsx:212-322`

**Interfaces:**
- Consumes: `window.api.profiles.addRemoveTime(name, deltaSeconds, subCategoryIds?)` from Task 3; the five `addtime_*` i18n keys from Task 1; existing keys `label_add`, `label_remove`, `label_hours`, `label_minutes`, `err_add_time_empty`, `btn_apply`, `btn_back`, `ctx_reset_time`, `confirm_reset_time_msg`, `label_auto_start`, `label_auto_art_follow`, `label_auto_art_on`, `label_auto_art_off` (all already used by the current `TimeTab`); `formatSeconds` from `@shared/format` (already imported at the top of `ModifyDialog.tsx`, line 14 — no new import needed); `useSettingsStore` from `../../state/settingsStore` (not yet imported in this file — Task 4 adds it) for resolving whether sub-categories are enabled, using the exact same `profile.subCategoriesEnabled ?? (settings?.subCategoriesEnabled ?? true)` pattern already used in `LibraryDetail.tsx:129,161`, `LibraryTab.tsx:26,70`, and `timerStore.ts:30-31` — this task doesn't invent a new resolution rule, it reuses the one those three call sites already establish.
- Produces: no new exports — `TimeTab` keeps its existing signature (`{ profile: Profile }`) and is still used unchanged by `AdjustTimeDialog.tsx` and `ModifyDialog`'s own Time tab. Neither host file needs any change.

This task does not touch `AdjustTimeDialog.tsx` — it renders `TimeTab` as-is and gets the two-step flow for free.

**Behavior being built** (from the design spec):
- Step `'amount'`: unchanged Add/Remove toggle and Hours/Minutes inputs. The button reads "Apply" (`btn_apply`) and applies immediately if the game has no *selectable* sub-categories; it reads "Continue →" (`addtime_continue`) and advances to step `'categories'` if it has at least one.
- "Selectable" means both `profile.subCategories.length > 0` AND sub-categories resolve enabled for this game (`profile.subCategoriesEnabled ?? globalSetting`) — a game that has sub-categories but has the feature turned off (globally, or overridden off for just this game) behaves exactly like a game with none: no step 2, existing history untouched, simply not offered as a target. This mirrors the exact gating the per-session play prompt already uses (`shouldPromptFor` in `timerStore.ts:27-32`).
- Step `'categories'` (only reachable when the game has selectable sub-categories per the rule above): shows the validated delta as a colored, non-translated numeric readout (`formatSeconds`, red for remove / accent for add — no ambiguity risk since it's just digits), a short translated question, a Select all / Select none pair, one checkbox per sub-category, a caption noting the main total is always included, a Back button (returns to step `'amount'` with the entered amount preserved), and an Apply button that commits main plus every ticked category.
- Ticking zero sub-categories in step 2 and pressing Apply is valid — it behaves exactly like a zero-sub-category game's direct Apply (main-only).
- The delta is validated once, in step 1, and stored — step 2 never recomputes it from the (now hidden) Hours/Minutes inputs, both because those inputs aren't on screen in step 2 and because re-running the zero-check there would fire the `err_add_time_empty` toast as a render side effect, which must never happen.
- The Hours and Minutes inputs get `id`/`htmlFor` association with their labels (`addtime-hours` / `addtime-minutes`) — today they're visually adjacent but not programmatically linked. This is a small, targeted fix to code this task is already touching: Task 6's E2E script needs to fill these fields through Playwright's `getByLabel`, the same semantic-locator approach `scripts/verify-subcategories.cjs` already uses for the sub-categories toggle (`getByLabel('Enable sub-categories for this game')`), and that only works once the label is actually associated with its input.

- [ ] **Step 1: Add the `useSettingsStore` import**

In `src/renderer/src/components/dialogs/ModifyDialog.tsx`, find (line 5):
```tsx
import { useProfilesStore } from '../../state/profilesStore'
```
Insert immediately after it:
```tsx
import { useSettingsStore } from '../../state/settingsStore'
```

- [ ] **Step 2: Replace the `TimeTab` function**

In `src/renderer/src/components/dialogs/ModifyDialog.tsx`, find the entire function from its doc comment through its closing brace (lines 207-322):
```tsx
/**
 * Exported so the Timer tab can offer Add/Remove time on its own, without
 * opening the whole editor. Same component in both places, so the two can
 * never drift apart.
 */
export function TimeTab({ profile }: { profile: Profile }): React.JSX.Element {
  const { t } = useTranslation()
  async function setAutoStart(value: boolean | null): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.detect.setAutoStartTimer(profile.name, value))
  }
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')

  async function resetTime(): Promise<void> {
    if (!window.confirm(t('confirm_reset_time_msg', { name: profile.name }))) return
    useProfilesStore.getState().upsert(await window.api.profiles.resetTime(profile.name))
  }

  async function apply(): Promise<void> {
    const h = parseInt(hours, 10) || 0
    const m = parseInt(minutes, 10) || 0
    const deltaSeconds = h * 3600 + m * 60
    if (deltaSeconds <= 0) {
      toast.error(t('err_add_time_empty'))
      return
    }
    const signed = direction === 'remove' ? -deltaSeconds : deltaSeconds
    const updated = await window.api.profiles.addRemoveTime(profile.name, signed)
    useProfilesStore.getState().upsert(updated)
    setHours('0')
    setMinutes('0')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* A timer setting, so it lives with the timer rather than with the art. */}
      {(profile.steamAppId != null || profile.exePath) && (
        <div className="border-b border-card pb-4">
          <label className="mb-1 block text-xs text-subtext">{t('label_auto_start')}</label>
          <div className="flex gap-1.5">
            {(
              [
                [null, t('label_auto_art_follow')],
                [true, t('label_auto_art_on')],
                [false, t('label_auto_art_off')]
              ] as [boolean | null, string][]
            ).map(([value, label]) => (
              <button
                key={String(value)}
                onClick={() => void setAutoStart(value)}
                className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
                  profile.autoStartTimer === value ? 'bg-accent text-bg' : 'bg-card text-text hover:bg-card/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={() => setDirection('add')}
          className={`flex-1 rounded px-3 py-1.5 text-sm ${direction === 'add' ? 'bg-accent text-bg' : 'bg-card text-text'}`}
        >
          {t('label_add')}
        </button>
        <button
          onClick={() => setDirection('remove')}
          className={`flex-1 rounded px-3 py-1.5 text-sm ${direction === 'remove' ? 'bg-accent text-bg' : 'bg-card text-text'}`}
        >
          {t('label_remove')}
        </button>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-subtext">{t('label_hours')}</label>
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-subtext">{t('label_minutes')}</label>
          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
          />
        </div>
      </div>
      <button
        onClick={() => void apply()}
        className="self-start rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
      >
        {t('btn_apply')}
      </button>

      {/*
       * D1: resetting the clock is a time action, so it belongs on the Time tab
       * beside the time — it was previously only reachable from a context menu.
       * Destructive, so it sits below the divider, in red, behind a confirm.
       */}
      <div className="mt-1 border-t border-card pt-4">
        <button
          onClick={() => void resetTime()}
          className="rounded px-3 py-1.5 text-xs text-red transition-colors hover:bg-red hover:text-bg"
        >
          {t('ctx_reset_time')}
        </button>
      </div>
    </div>
  )
}
```

Replace it with:
```tsx
/**
 * Exported so the Timer tab can offer Add/Remove time on its own, without
 * opening the whole editor. Same component in both places, so the two can
 * never drift apart.
 *
 * Two steps: enter the amount, then — only if the game has sub-categories —
 * choose which ones also get it. Main always receives the full delta
 * regardless of what's ticked; unticking every category is valid and just
 * means main-only, identical to a game with no sub-categories at all.
 */
export function TimeTab({ profile }: { profile: Profile }): React.JSX.Element {
  const { t } = useTranslation()
  const globalSubCategoriesEnabled = useSettingsStore((s) => s.settings?.subCategoriesEnabled ?? true)
  const subCategoriesEnabled = profile.subCategoriesEnabled ?? globalSubCategoriesEnabled
  const hasSelectableCategories = subCategoriesEnabled && profile.subCategories.length > 0
  async function setAutoStart(value: boolean | null): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.detect.setAutoStartTimer(profile.name, value))
  }
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [step, setStep] = useState<'amount' | 'categories'>('amount')
  const [pendingDelta, setPendingDelta] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  async function resetTime(): Promise<void> {
    if (!window.confirm(t('confirm_reset_time_msg', { name: profile.name }))) return
    useProfilesStore.getState().upsert(await window.api.profiles.resetTime(profile.name))
  }

  /** Reads the Hours/Minutes inputs, validates, and returns a signed total — or null (after toasting) if it's zero. */
  function readDelta(): number | null {
    const h = parseInt(hours, 10) || 0
    const m = parseInt(minutes, 10) || 0
    const deltaSeconds = h * 3600 + m * 60
    if (deltaSeconds <= 0) {
      toast.error(t('err_add_time_empty'))
      return null
    }
    return direction === 'remove' ? -deltaSeconds : deltaSeconds
  }

  async function commit(signed: number, subCategoryIds: string[]): Promise<void> {
    const updated = await window.api.profiles.addRemoveTime(profile.name, signed, subCategoryIds)
    useProfilesStore.getState().upsert(updated)
    setHours('0')
    setMinutes('0')
    setStep('amount')
    setSelectedIds(new Set())
  }

  async function continueOrApply(): Promise<void> {
    const signed = readDelta()
    if (signed == null) return
    if (!hasSelectableCategories) {
      await commit(signed, [])
      return
    }
    setPendingDelta(signed)
    setStep('categories')
  }

  async function applyWithCategories(): Promise<void> {
    await commit(pendingDelta, Array.from(selectedIds))
  }

  function toggleCategory(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* A timer setting, so it lives with the timer rather than with the art. */}
      {(profile.steamAppId != null || profile.exePath) && (
        <div className="border-b border-card pb-4">
          <label className="mb-1 block text-xs text-subtext">{t('label_auto_start')}</label>
          <div className="flex gap-1.5">
            {(
              [
                [null, t('label_auto_art_follow')],
                [true, t('label_auto_art_on')],
                [false, t('label_auto_art_off')]
              ] as [boolean | null, string][]
            ).map(([value, label]) => (
              <button
                key={String(value)}
                onClick={() => void setAutoStart(value)}
                className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
                  profile.autoStartTimer === value ? 'bg-accent text-bg' : 'bg-card text-text hover:bg-card/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'amount' && (
        <>
          <div className="flex gap-1.5">
            <button
              onClick={() => setDirection('add')}
              className={`flex-1 rounded px-3 py-1.5 text-sm ${direction === 'add' ? 'bg-accent text-bg' : 'bg-card text-text'}`}
            >
              {t('label_add')}
            </button>
            <button
              onClick={() => setDirection('remove')}
              className={`flex-1 rounded px-3 py-1.5 text-sm ${direction === 'remove' ? 'bg-accent text-bg' : 'bg-card text-text'}`}
            >
              {t('label_remove')}
            </button>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="addtime-hours" className="mb-1 block text-xs text-subtext">
                {t('label_hours')}
              </label>
              <input
                id="addtime-hours"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="addtime-minutes" className="mb-1 block text-xs text-subtext">
                {t('label_minutes')}
              </label>
              <input
                id="addtime-minutes"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
              />
            </div>
          </div>
          <button
            onClick={() => void continueOrApply()}
            className="self-start rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
          >
            {hasSelectableCategories ? t('addtime_continue') : t('btn_apply')}
          </button>
        </>
      )}

      {step === 'categories' && (
        <>
          <div>
            <div className={`text-sm font-medium ${pendingDelta < 0 ? 'text-red' : 'text-accent'}`}>
              {pendingDelta < 0 ? '−' : '+'}
              {formatSeconds(Math.abs(pendingDelta))}
            </div>
            <p className="mt-1 text-xs text-subtext">{t('addtime_step2_question')}</p>
          </div>
          <div className="flex gap-3 text-xs">
            <button
              onClick={() => setSelectedIds(new Set(profile.subCategories.map((c) => c.id)))}
              className="text-accent hover:opacity-80"
            >
              {t('addtime_select_all')}
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-accent hover:opacity-80">
              {t('addtime_select_none')}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {profile.subCategories.map((cat) => (
              <label
                key={cat.id}
                className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text hover:bg-card/60"
              >
                <input type="checkbox" checked={selectedIds.has(cat.id)} onChange={() => toggleCategory(cat.id)} />
                {cat.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-subtext">{t('addtime_main_note')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('amount')}
              className="rounded bg-card px-4 py-1.5 text-sm text-text hover:bg-card/70"
            >
              {t('btn_back')}
            </button>
            <button
              onClick={() => void applyWithCategories()}
              className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
            >
              {t('btn_apply')}
            </button>
          </div>
        </>
      )}

      {/*
       * D1: resetting the clock is a time action, so it belongs on the Time tab
       * beside the time — it was previously only reachable from a context menu.
       * Destructive, so it sits below the divider, in red, behind a confirm.
       */}
      <div className="mt-1 border-t border-card pt-4">
        <button
          onClick={() => void resetTime()}
          className="rounded px-3 py-1.5 text-xs text-red transition-colors hover:bg-red hover:text-bg"
        >
          {t('ctx_reset_time')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full unit test suite**

Run: `npm test`
Expected: all existing tests still pass — this task doesn't change any pure function Vitest covers, only a React component with no unit tests of its own (it's covered by Task 6's E2E script instead, same as the rest of the dialog layer).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/dialogs/ModifyDialog.tsx
git commit -m "Rework Add/Remove Time into a two-step flow with sub-category selection"
git push origin dev
```

---

### Task 5: Version bump

**Files:**
- Modify: `package.json:3`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks depend on — this only needs to happen before Task 6 packages a build to test against, so the running app's version number (visible in the About tab and update checks) reflects this change.

- [ ] **Step 1: Bump the version**

In `package.json`, find:
```json
  "version": "3.4.17",
```
Replace with:
```json
  "version": "3.4.18",
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "dev: bump to 3.4.18"
git push origin dev
```

---

### Task 6: Real-app E2E verification

**Files:**
- Create: `scripts/verify-add-remove-time-subcategories.cjs`

**Interfaces:**
- Consumes: the real `TimeTab` UI from Task 4 — clicked through with Playwright, not substituted with direct `window.api.*` calls. This repo has a standing rule for exactly this situation: raw IPC calls are fine for setup and for reading back the result to assert on, but not as a stand-in for the actual user interaction under test, because the renderer's Zustand store only learns about a change through the app's own click-driven code paths, and a script that skips that can end up asserting against state the UI itself never actually reached. This script therefore uses `window.api.profiles.createSubCategory(...)` and, in two blocks, a setup-only `addRemoveTime(...)` call to establish starting state (exactly as `scripts/verify-subcategories.cjs` already does for its own setup) — but the add/remove being tested in each block always happens by clicking the real Add/Remove toggle, filling the real Hours/Minutes inputs, and clicking through Continue/checkboxes/Apply, the same as the girlfriend or the user would.
- Produces: nothing further tasks depend on. This is the final gate before shipping.

**This script launches a real Electron app against a scratch profile — follow the Global Constraints safety protocol before running it.**

- [ ] **Step 1: Build the app so `out/main/index.js` exists to patch and launch**

Run: `npm run build`
Expected: exits 0, `out/main/index.js` exists.

- [ ] **Step 2: Back up both real save files**

Run:
```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
for (const channel of ['gametimer-dev', 'gametimer']) {
  const src = path.join(os.homedir(), 'AppData', 'Roaming', channel, 'game_timer_data.json');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, src + '.backup-' + Date.now());
    console.log('Backed up:', src);
  } else {
    console.log('No file to back up for', channel, '(nothing at', src, ')');
  }
}
"
```
Expected: a `.backup-<timestamp>` copy alongside each real save file that exists. Do not proceed until this has run successfully.

- [ ] **Step 3: Write the script**

Create `scripts/verify-add-remove-time-subcategories.cjs`:
```js
/*
 * Add/Remove Time now also credits sub-categories (previously it only ever
 * touched the main total, on both add AND remove — the bug the user's
 * girlfriend found), and the Time tab is now a two-step flow. Driven
 * through the real UI (buttons, inputs, checkboxes) per
 * feedback-test-via-real-ui — raw window.api.* calls are used only for
 * setup and for reading back the result, never as a stand-in for the
 * add/remove action itself.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-add-remove-time-subcategories-tmp')
// 'gametimer', not 'gametimer-dev': this script runs against the plain
// `npm run build` output (GAMUT_CHANNEL unset), which resolves
// USER_DATA_FOLDER to the prod-channel name regardless of what's installed
// on this machine. Matches verify-subcategories.cjs exactly.
const ROOT = path.join(SCRATCH, 'gametimer')
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
  const userDataDir = path.join(appDataRoot, 'gametimer')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(path.join(userDataDir, 'firstrun.json'), JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' }))
  fs.writeFileSync(
    path.join(userDataDir, 'game_timer_data.json'),
    JSON.stringify({
      profiles: { 'Time Test Game': game('Time Test Game') },
      lastSelected: 'Time Test Game',
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en', subCategoriesEnabled: true }
    })
  )
  return appDataRoot
}

const readProfile = (appDataRoot) =>
  JSON.parse(fs.readFileSync(path.join(appDataRoot, 'gametimer', 'game_timer_data.json'), 'utf8'))
    .profiles['Time Test Game']

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

/** Selects the game, opens Modify, switches to the Time tab. */
async function openTimeTab(win) {
  await win.locator('text=Time Test Game').click()
  await win.getByText('Modify', { exact: true }).click()
  await win.getByText('Time', { exact: true }).click()
  await win.waitForTimeout(200)
}

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  ensureBundlePatched()

  console.log('\n=== zero sub-categories: step 1\'s button applies directly, step 2 never appears ===')
  {
    const { app, win, appDataRoot } = await launch('no-subcats')
    await openTimeTab(win)
    check('button reads Apply, not Continue, with no sub-categories', await win.getByText('Apply', { exact: true }).count(), 1)
    await win.getByLabel('Hours').fill('1')
    await win.getByText('Apply', { exact: true }).click()
    await win.waitForTimeout(300)
    check('step 2 never rendered', await win.getByText('Select all', { exact: true }).count(), 0)
    const profile = readProfile(appDataRoot)
    check('main gained the full amount', profile.seconds, 3600)
    check('no sub-categories exist to touch', profile.subCategories.length, 0)
    await closeApp(app)
  }

  console.log('\n=== adding time credits main AND every ticked sub-category by the same amount ===')
  {
    const { app, win, appDataRoot } = await launch('add-ticked')
    await win.evaluate(() => window.api.profiles.createSubCategory('Time Test Game', 'Casual'))
    await win.evaluate(() => window.api.profiles.createSubCategory('Time Test Game', 'Speedrun'))
    await openTimeTab(win)
    await win.getByLabel('Hours').fill('1')
    await win.getByText('Continue →', { exact: true }).click()
    await win.waitForTimeout(200)
    check('step 2 shows the validated amount', await win.getByText('+01:00:00', { exact: true }).count(), 1)
    // Tick only Casual — Speedrun must not move.
    await win.getByLabel('Casual').check()
    await win.getByText('Apply', { exact: true }).click()
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('main gained the full amount', profile.seconds, 3600)
    check('ticked category gained the same amount', profile.subCategories.find((c) => c.name === 'Casual').seconds, 3600)
    check('untouched category stayed at zero', profile.subCategories.find((c) => c.name === 'Speedrun').seconds, 0)
    await closeApp(app)
  }

  console.log('\n=== removing time debits main AND every ticked sub-category — the exact bug the girlfriend found ===')
  {
    const { app, win, appDataRoot } = await launch('remove-all-ticked')
    await win.evaluate(() => window.api.profiles.createSubCategory('Time Test Game', 'Casual'))
    await win.evaluate(() => window.api.profiles.createSubCategory('Time Test Game', 'Speedrun'))
    const ids = readProfile(appDataRoot).subCategories.map((c) => c.id)
    // Setup only, via IPC (see feedback-test-via-real-ui): give main and both
    // categories a known starting total, so the block's real-UI interaction
    // below is purely the REMOVE being tested, not this setup.
    await win.evaluate((ids) => window.api.profiles.addRemoveTime('Time Test Game', 3600, ids), ids)
    await win.waitForTimeout(300)
    check('setup: both categories credited by the add', readProfile(appDataRoot).subCategories.every((c) => c.seconds === 3600), true)

    await openTimeTab(win)
    await win.getByText('Remove', { exact: true }).click()
    await win.getByLabel('Minutes').fill('20')
    await win.getByText('Continue →', { exact: true }).click()
    await win.waitForTimeout(200)
    check('step 2 shows the validated removal amount', await win.getByText('−00:20:00', { exact: true }).count(), 1)
    await win.getByText('Select all', { exact: true }).click()
    await win.getByText('Apply', { exact: true }).click()
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('main lost the removed amount', profile.seconds, 2400)
    check('both ticked categories lost the same amount', profile.subCategories.every((c) => c.seconds === 2400), true)
    await closeApp(app)
  }

  console.log('\n=== removing more than a sub-category has clamps that category at zero, independent of main ===')
  {
    const { app, win, appDataRoot } = await launch('over-remove')
    await win.evaluate(() => window.api.profiles.createSubCategory('Time Test Game', 'Casual'))
    const id = readProfile(appDataRoot).subCategories[0].id
    // Setup only, via IPC: main starts with a large history; the category
    // only has a small amount — the over-removal itself happens via the UI below.
    await win.evaluate(() => window.api.profiles.addRemoveTime('Time Test Game', 7200))
    await win.evaluate((id) => window.api.profiles.addRemoveTime('Time Test Game', 300, [id]), id)
    await win.waitForTimeout(300)
    check('setup: category has its small amount before the over-removal', readProfile(appDataRoot).subCategories[0].seconds, 300)

    await openTimeTab(win)
    await win.getByText('Remove', { exact: true }).click()
    await win.getByLabel('Hours').fill('1')
    await win.getByText('Continue →', { exact: true }).click()
    await win.waitForTimeout(200)
    await win.getByLabel('Casual').check()
    await win.getByText('Apply', { exact: true }).click()
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('category clamped at zero rather than going negative', profile.subCategories[0].seconds, 0)
    check('main still lost the FULL requested amount, unaffected by the category clamp', profile.seconds, 3900)
    await closeApp(app)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 4: Add the scratch directory to `.gitignore`**

In `.gitignore`, find:
```
.verify-idle-baseline-tmp/
```
Insert immediately after it:
```
.verify-add-remove-time-subcategories-tmp/
```

- [ ] **Step 5: Run the script**

Run: `node scripts/verify-add-remove-time-subcategories.cjs`
Expected: `ALL CHECKS PASSED`, exit code 0. If anything fails, read the `FAIL` lines (they print expected vs. actual), fix the implementation in Task 3, and re-run — do not edit the script's expectations to match a wrong result.

- [ ] **Step 6: Check for orphaned processes**

Run (PowerShell): `Get-Process electron -ErrorAction SilentlyContinue`
Expected: no results (each `closeApp` call force-kills its own process tree). If any are found, kill them: `Stop-Process -Name electron -Force`.

- [ ] **Step 7: Diff both real save files against their backups to confirm they're untouched**

Run:
```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
for (const channel of ['gametimer-dev', 'gametimer']) {
  const dir = path.join(os.homedir(), 'AppData', 'Roaming', channel);
  if (!fs.existsSync(dir)) continue;
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('game_timer_data.json.backup-'));
  if (backups.length === 0) continue;
  const latest = backups.sort().at(-1);
  const current = fs.readFileSync(path.join(dir, 'game_timer_data.json'), 'utf8');
  const backup = fs.readFileSync(path.join(dir, latest), 'utf8');
  console.log(channel, current === backup ? 'UNCHANGED — matches backup' : 'DIFFERS FROM BACKUP — investigate before proceeding');
}
"
```
Expected: `UNCHANGED — matches backup` for every channel that had a real file. If anything differs, stop and investigate before doing anything else — do not delete the backup.

- [ ] **Step 8: Delete the backup files now that they're confirmed unneeded**

Run (PowerShell):
```powershell
Get-ChildItem "$env:APPDATA\gametimer-dev\game_timer_data.json.backup-*", "$env:APPDATA\gametimer\game_timer_data.json.backup-*" -ErrorAction SilentlyContinue | Remove-Item
```

- [ ] **Step 9: Run the full test suite and typecheck one more time on the final state**

Run: `npm run typecheck && npm test`
Expected: both green.

- [ ] **Step 10: Commit**

```bash
git add scripts/verify-add-remove-time-subcategories.cjs .gitignore
git commit -m "Add real-app E2E verification for Add/Remove Time sub-category crediting"
git push origin dev
```
