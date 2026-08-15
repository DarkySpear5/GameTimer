# Sub-categories — design

Idea from the user's girlfriend: some games get played more than once with a
genuinely different goal each time (a 100% completionist save, a casual
replay, a challenge run with self-imposed rules) and the single flat
`seconds` total can't tell those apart. This adds an optional, per-game way
to break a game's time down into named buckets — without touching anything
else about how the game is tracked.

Worked out over a long back-and-forth with the user; every rule below was
explicitly confirmed, not assumed. Where an edge case came up mid-discussion,
it's called out so the reasoning survives past this conversation.

## What this is NOT

The first version of the idea (each sub-category as a near-duplicate mini
game, with its own rating/notes/completion/screenshots) was floated and
explicitly dropped by the user for feeling "overwhelming and cluttered."
**A sub-category is a label on time, nothing else.** Rating, notes,
screenshots, genres, and completion status all stay exactly what they are
today: one value per game, full stop. If a screenshot is taken while any
sub-category is selected, it's still just a screenshot of that game.

## Data model

```ts
interface SubCategory {
  id: string
  name: string
  seconds: number        // this bucket's own running total
}

// added to Profile:
subCategories: SubCategory[]
subCategoriesEnabled: boolean | null   // null = follow the global setting
```

New global setting (Settings → Games): `subCategoriesEnabled: boolean`
(defaults to `true` — the feature only ever does anything on a game that
already has sub-categories, so defaulting on costs nothing for a game with
none). A game's own `subCategoriesEnabled` overrides the global default,
exactly like `autoFetchArt` and `autoStartTimer` already do today
(`null` = inherit, explicit `true`/`false` = override this game only).

**The main total (`profile.seconds`) is always the sum of everything.**
Time played under a sub-category still counts toward the game's main total
— sub-categories are a breakdown of that total, never a separate pool of
time. This was confirmed directly: playing under "Casual" must still grow
the number shown on the game's own page.

## Why no changes to the timer engine

This is the load-bearing decision in the whole design. The user's
requirement was specific: the real-time clock must never wait on the "which
category?" prompt, and answering it late must never lose or double-count
time, and must never overwrite a sub-category's total with the game's
(much larger) main total.

The timer already does the right thing today: `timerEngine.start(name)`
begins accumulating into `profile.seconds` immediately, checkpointed
crash-safely, completely independent of any UI. Sub-category attribution
piggybacks on that instead of introducing a second clock:

1. When a timer starts, snapshot `sessionStartSeconds = profile.seconds`
   (before this session's time begins landing).
2. The prompt can be answered any time — instantly, minutes later, or after
   the session has already been paused. Whenever it resolves to a specific
   sub-category, compute `elapsed = profile.seconds - sessionStartSeconds`
   (which, thanks to the existing checkpoint, is already exactly correct —
   the answer doesn't have to be live) and add it:
   `subCategory.seconds += elapsed`.
3. Answering **None**, or closing the prompt / stopping the timer without
   answering, does nothing further — the time already landed in the main
   total in step 1's ordinary course, same as a game with no sub-categories.

No new "is a sub-category session active" state, no changes to `gameWatcher`,
the overlay's game-matching, or crash recovery (`recoverSession.ts`) — all of
those keep working against `profile.seconds`/`activeSession` exactly as they
do today. A sub-category is credited once, after the fact, from numbers that
already exist.

**Rejected alternative**: give each sub-category its own semi-independent
timer/`activeSession`, closer to a "mini profile." Explicitly heavier for no
benefit once rating/notes/completion were confirmed to stay singular — it
would mean teaching the timer engine, `gameWatcher`, the overlay, and crash
recovery about multiple concurrent sessions per game, none of which this
feature needs.

## Library Detail — the sub-category list

Directly below the star Rating section (same section stack as today: Time
Played/Sessions/Average → Rating → **Sub-categories** → Genres). A small
scrollable list, not tabs or a grid:

```
SUB-CATEGORIES                              [+ New]
  100% Completion            42:18:05
  Casual                     12:03:40
  Challenge (no CC)           3:22:00
```

- Zero sub-categories on a game → this section doesn't render at all. No
  visual change for anyone not using the feature.
- Click a name to rename it inline (same interaction as renaming a Note
  title).
- Each row gets a delete affordance. Deleting a sub-category deletes its
  time record — no undo, matches how deleting anything else in Gamut works
  (confirm dialog, not soft-delete).
- A small enable/disable switch lives in this section too (see Settings
  below) — visible once the game has at least one sub-category.

## The per-session prompt

Fires when a timer starts (Play button, or auto-start-on-launch) **only
if** the game has ≥1 sub-category and `subCategoriesEnabled` resolves
`true` for it. A standard Modal, same as every other explicit-choice
dialog in Gamut (AddGameDialog, ModifyDialog, …) — no new UI pattern
needed. The thing that must NOT wait for it is the timer, which is a data
concern, not a UI one: the timer already runs entirely independently of
any dialog (see "Why no changes to the timer engine" above), so the modal
being blocking costs nothing — closing it without answering is exactly
equivalent to answering None.

Options, in order: **None** (explicit "just Main," same outcome as not
answering), each existing sub-category, then **+ New** to create one on the
spot and immediately select it. If the game has zero sub-categories and the
feature is enabled, no prompt appears at all — nothing to choose from yet.

## Complete button

Unchanged when a game has zero sub-categories.

When a game has ≥1 sub-category, pressing Complete first asks which
timer's *current* total should become `statusSeconds` — Main or any
sub-category — then proceeds exactly as it does today (sets `status`,
`statusAt`, `statusSeconds`). No separate right-click path for this — the
user explicitly asked for it to live on the existing Complete button, not a
second hidden entry point.

## Settings

- **Settings → Games**: new `subCategoriesEnabled` toggle, default on.
  Turning it off does not delete any game's sub-category data — it stops
  the prompt from firing (for any game whose own setting is `null`,
  inheriting the default) but every sub-category's accumulated time stays
  intact and still shows in Library Detail and profile stats.
- **Per-game override**: the switch living in the sub-category list section
  itself. Same "disable ≠ delete" guarantee — turning it off for one game
  only stops new sessions from being attributable to that game's
  sub-categories; history is untouched.

## Profile stats — per-game breakdown

Right-click a game in Library → **"Show profile stats"** (new option,
alongside the existing right-click actions) opens a small window: each
sub-category's time as a percentage of the game's total, using the same
percentage treatment Profile Stats already applies to idle/active time.
Untagged time (everything not attributed to any sub-category — including
every session from before this feature existed) shows as its own slice
rather than being silently absorbed.

## Unrelated small fix, bundled because it was raised in the same conversation

Game Stats' Advanced mode currently adds a **Genres** column to the table
(`DataTab.tsx`) — this is what the user meant by "the categories" showing
in Advanced mode, confirmed by reading the source rather than guessing.
Drop that column. Not connected to sub-categories at all; just cheap to
include here since it came up in the same discussion.

## Explicitly out of scope for this pass

- Per-sub-category rating, notes, screenshots, completion status, or
  genres — the user ruled these out directly.
- Tagging individual `sessionLog` entries with which sub-category they
  belong to (would enable a future "which sessions contributed to this
  bucket" history view). Not required for anything specified here; noted
  as a cheap-to-add-later field if it comes up, not built now.
- A persistent "active sub-category" you click to set once and reuse
  across sessions. Superseded mid-conversation by "ask every time."
