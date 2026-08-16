# Add/Remove Time rework — design

Two problems, one fix. The user's girlfriend found that removing time from
a game doesn't remove it from any sub-category — only the main total moves.
Adding time has the exact same gap; it was simply never wired up when
sub-categories shipped. Separately, the user has never liked the Time
tab's layout ("I never really liked it anyways") and asked for a rework,
not just a patch: "I want something more intuitive."

This spec covers both — the missing write, and the new interaction that
replaces the current toggle + two number fields + single Apply button.

## Current behavior

`TimeTab` (`src/renderer/src/components/dialogs/ModifyDialog.tsx:212-322`)
has a direction toggle (Add/Remove), an Hours field, a Minutes field, and
an Apply button. `apply()` computes a signed `deltaSeconds` and calls
`window.api.profiles.addRemoveTime(profile.name, deltaSeconds)`, which
only ever touches `profile.seconds`
(`src/main/store/profileService.ts:588-601`). `SubCategory.seconds` is
never involved — not on add, not on remove. `TimeTab` is used in two
places (`ModifyDialog`'s own Time tab, and standalone in
`AdjustTimeDialog.tsx` from the Timer tab's right-click menu), and both
need to keep working after this rework.

## Flow

Two steps, but the second step only exists at all when the game has
sub-categories — a game with none behaves exactly like today, just with a
cleaner step 1.

**Step 1 — set the amount.**
- Add/Remove toggle (unchanged pattern, kept as-is).
- Duration as two inline number boxes, `[ 1 ]h  [ 30 ]m`, not a single
  free-text field. A merged text field ("1h 30m") was considered and
  rejected: the user pointed out "1:30" is genuinely ambiguous — could
  mean 1h30m or 1m30s. Separate labeled H/M boxes are unambiguous by
  construction and stay just as compact.
- Zero total still blocks with the existing `err_add_time_empty` toast —
  unchanged validation.
- If the game has **zero** sub-categories: the button reads Apply, and
  pressing it does exactly what Apply does today (adjusts main only). No
  step 2, nothing new to look at for anyone not using sub-categories.
- If the game has **at least one** sub-category: the button reads
  Continue →, and pressing it advances to step 2 instead of applying
  immediately.

**Step 2 — choose which sub-categories also get it (only reachable when
the game has ≥1 sub-category).**
- Header states the pending action plainly, e.g. "Apply −1h 30m to which
  categories?"
- A checklist, one row per sub-category, each independently tickable.
- Select all / Select none shortcut above the list.
- **Main is not a checklist item and is never itself untickable** — it
  always receives the full delta no matter what's ticked here. This
  reverses the user's original framing ("select which timer to apply
  that to, including main"); during clarification the user picked this
  exact framing instead ("Main always adjusts; ticks are only for
  sub-categories") because it removes an entire failure mode — there's no
  way to tick nothing and have the button do nothing.
- **Ticking zero sub-categories is valid**, not blocked. It's just a
  main-only adjustment, identical to today's behavior for a game with no
  sub-categories. This also reverses the user's original ask ("if you
  select none, you can't go further") — raised directly during
  clarification, and the user chose the permissive option once it was
  clear "none" can no longer mean "do nothing," since main always moves
  regardless.
- Back link returns to step 1 with the amount preserved (no re-entry).
- Apply commits the whole thing: main gets the full delta, every ticked
  sub-category gets the same delta (see clamp rule below).

Applying (from either step 1's direct Apply or step 2's Apply) resets the
form back to the zeroed `0h 0m` / Add state, same as today.

## Backend / data model

**`src/shared/subCategories.ts` — `creditSubCategory`.** Currently a
no-op on non-positive deltas:
```ts
if (deltaSeconds <= 0) return subCategories
```
This becomes bidirectional. A negative delta subtracts, clamped at 0 —
the same floor the main total already enforces in `addRemoveTime`:
```ts
export function creditSubCategory(
  subCategories: SubCategory[],
  id: string,
  deltaSeconds: number
): SubCategory[] {
  if (!subCategories.some((c) => c.id === id)) return subCategories
  return subCategories.map((c) =>
    c.id === id ? { ...c, seconds: Math.max(0, c.seconds + deltaSeconds) } : c
  )
}
```
The old early-return only ever guarded against no-op zero deltas and
(implicitly) removal, since removal wasn't implemented; zero deltas still
can't reach this function because `TimeTab` continues to block them
before calling the API at all.

**`src/main/store/profileService.ts` — `addRemoveTime`.** Signature
gains a third parameter:
```ts
async addRemoveTime(
  name: string,
  deltaSeconds: number,
  subCategoryIds: string[]
): Promise<Profile> {
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
}
```
Main's own clamp/`lastPlayed` behavior is unchanged. Every id in
`subCategoryIds` receives the identical signed `deltaSeconds` main just
received — same amount, same direction, clamped independently per
category by `creditSubCategory`. Passing `[]` (game has no sub-categories,
or the user ticked none in step 2) is a normal, valid call that only
touches main — no special-casing needed on the backend.

**IPC contract.** `window.api.profiles.addRemoveTime` (preload bridge +
its main-process handler) gains the same third parameter,
`subCategoryIds: string[]`, passed straight through.

## Edge cases

- **Removing more than a sub-category has**: that category clamps to 0
  independently. Main still loses the full requested amount regardless of
  what any individual sub-category had — main's clamp and each
  sub-category's clamp are computed separately, not against each other.
  Confirmed directly with the user during clarification.
- **`subCategoriesEnabled` is off** (globally or per-game): step 2 is
  skipped the same as zero-sub-categories, since the prompt-gating
  condition (`hasSubCategories && subCategoriesEnabled resolves true`)
  already mirrors the one the per-session play prompt uses (see the
  2026-08-14 sub-categories design doc). Existing sub-category time
  isn't touched by this feature either way — it's just not offered as a
  target.
- **Deleting a sub-category mid-flow isn't reachable**: the dialog is
  modal, so there's no other surface to delete one from while step 2 is
  open.
- **`AdjustTimeDialog.tsx` standalone usage**: unaffected structurally —
  it renders `TimeTab` as-is, so it gets the two-step flow for free with
  no changes to that file.

## Testing plan

- Unit tests for `creditSubCategory`'s new negative-delta branch:
  subtracting less than current (normal case), subtracting more than
  current (clamps to 0), subtracting from an id that doesn't exist
  (unchanged no-op), positive delta still additive (regression).
- Unit tests for `addRemoveTime`'s new third parameter: empty array
  touches only main (regression against today's behavior); one id credits
  both main and that category by the same signed amount; multiple ids all
  receive it; over-removal clamps main and an affected sub-category
  independently in the same call.
- Real-UI E2E script (`scripts/verify-*.cjs` pattern, per this repo's
  established safety protocol — back up both real save files and confirm
  the exact `GAMUT_TEST_APPDATA` literal is patched into the bundle
  before launching, no exceptions): drive the full two-step flow
  on a game with ≥2 sub-categories — add time ticking one category,
  confirm main and that category both grew by the same amount and the
  other category didn't move; remove time ticking all categories,
  confirm every category and main dropped together; remove more than a
  category has, confirm that category reads 0 while main reflects the
  full requested removal; run Apply directly from step 1 on a
  zero-sub-category game, confirm no step 2 ever appears.

## Out of scope for this pass

- Any change to the per-session "which category?" prompt that fires on
  timer start — that's a separate, already-shipped mechanism (the
  2026-08-14 sub-categories design) and isn't touched here.
- A persistent "last used categories" default for step 2's checklist.
  Not requested; every Add/Remove starts from a clean slate.
- Changing what Complete does with sub-category totals — unrelated to
  this feature.
