# Per-game play-history chart implementation plan

**Goal:** Add a durable per-game daily playtime ledger and themed charts, first tested only in Gamut Launcher Dev. Existing total time remains intact, and the short raw-session history stays capped for performance.

**Architecture:** Persist a compact `YYYY-MM-DD -> seconds` ledger beside existing aggregate stats. Update it from timer checkpoints by splitting elapsed time at local midnight. Migrate existing profiles by recording their already-known total as a clearly labelled baseline on their Started On date; this preserves the total without pretending unknown past sessions happened on one day. Renderer selectors turn that permanent ledger into fixed calendar buckets, and a custom SVG chart renders from theme variables.

**Safety boundary:** The implementation and installer test stay on `codex/charts-dev` and use Gamut Launcher Dev (`%APPDATA%\\gametimer-dev`). No Stable profile, Stable installer, GitHub release, or `main` push is part of this plan.

## Task 1: Add the permanent daily-ledger domain model

**Files:**

- Modify: `src/shared/types.ts`
- Create: `src/shared/playHistory.ts`
- Create: `src/shared/playHistory.spec.ts`
- Modify: `src/shared/sessionStats.ts`

**Steps:**

1. Add a `PlayHistory` field to `Profile`, containing a version, an optional `baseline`, and a `dailySeconds` record keyed by local ISO date.
2. Create pure helpers for an empty ledger, validating a date key, recording elapsed milliseconds across local-midnight boundaries, cloning, and obtaining the earliest retained date.
3. Keep `sessionLog` and its 200-entry cap untouched; the new ledger is independent and has no retention limit.
4. Add unit tests for one-day writes, exact-midnight splits, multi-day splits, zero/negative durations, and serialization-safe cloning.

## Task 2: Migrate and preserve play history through every profile path

**Files:**

- Modify: `src/main/store/schema.ts`
- Modify: `src/main/store/migrateSessions.ts`
- Modify: `src/shared/recoverSession.ts`
- Modify: `src/main/timer/timerEngine.ts`
- Modify: `src/main/store/profileService.ts`
- Modify: `src/main/importer/gtprofile.ts`
- Create: `src/main/store/playHistoryMigration.spec.ts`
- Modify: `src/main/timer/timerEngine.spec.ts`

**Steps:**

1. Extend the persisted schema with a compatibility default for the new ledger.
2. During load migration, initialize a missing ledger with one baseline entry: current profile total seconds and Started On, falling back to first-played then the migration date. Do not modify `profile.seconds`.
3. Route normal pauses, periodic checkpoints, shutdown checkpoints, and recovered interrupted sessions through the midnight-splitting ledger helper using the exact interval being credited to total time.
4. Ensure duplicate profile deep-copies the ledger, time reset clears it, manual add/remove adjusts only the transparent baseline, and import/export round-trips it safely.
5. Test migration baseline selection, duplicate/reset/import behavior, timer checkpoint accounting, and crash recovery accounting.

## Task 3: Build tested chart data and themed SVG chart components

**Files:**

- Create: `src/renderer/src/components/charts/playHistoryBuckets.ts`
- Create: `src/renderer/src/components/charts/playHistoryBuckets.spec.ts`
- Create: `src/renderer/src/components/charts/PlayHistoryChart.tsx`
- Create: `src/renderer/src/components/charts/PlayHistoryChart.css`

**Steps:**

1. Create pure bucket selectors for seven daily buckets, thirty daily buckets, fifty-two weekly buckets, and all-time monthly buckets. Include every calendar bucket, including zero-play buckets.
2. Keep baseline data visually distinct from recorded daily data and expose its tooltip copy as “Earlier playtime”.
3. Build an accessible SVG bar chart with a zero baseline, date labels, hour-scaled Y axis, keyboard-focusable bars, and a tooltip using the current duration-format preference.
4. Use existing CSS variables for panel, muted text, text, and accent colours so every theme updates the chart automatically.
5. Test bucket edge cases: empty profile, only baseline, range boundaries, zero days, and multi-year aggregation.

## Task 4: Place the chart in the game detail page and add the detail window

**Files:**

- Modify: `src/renderer/src/pages/LibraryDetail.tsx`
- Create: `src/renderer/src/components/dialogs/PlayHistoryDialog.tsx`
- Modify: `src/renderer/src/state/uiStore.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/i18n/en.ts`
- Modify: `src/renderer/src/styles.css` or the relevant component stylesheet
- Create: `src/renderer/src/components/dialogs/PlayHistoryDialog.spec.tsx`

**Steps:**

1. Put the compact seven-day chart in the previously empty detail-panel space, below game metadata and above the action bar.
2. Add “More details”, opening a normal app dialog with Month, Year, and All Time choices and the corresponding bucket selector.
3. Provide clear empty-state text when no recorded daily activity exists yet, while still showing an existing migrated baseline.
4. Use existing dialog focus and close conventions; localize all new visible English text through the app’s translation path.
5. Test range switching, modal open/close, baseline legend, and empty state.

## Task 5: Add a Dev-only no-write chart preview and verify the Dev package

**Files:**

- Create: `src/renderer/src/dev/playHistorySimulation.ts`
- Modify: `src/renderer/src/pages/LibraryDetail.tsx`
- Create: `src/renderer/src/dev/playHistorySimulation.spec.ts`
- Modify: `package.json` only if a focused Dev-preview script is needed

**Steps:**

1. Provide a fixed, in-memory fixture containing a baseline plus varied daily playtime, including zero days, long sessions, and a month boundary.
2. Show a Dev-channel-only “Preview chart” control that swaps only the chart’s input. It must not call IPC, alter the selected profile, or write any user data.
3. Verify the control is excluded in Stable builds.
4. Run focused tests, the complete test suite, TypeScript validation, production build, and a Dev installer build using `electron-builder.dev.yml` with publishing disabled.
5. Launch only the resulting Gamut Launcher Dev build for the user’s visual simulation check. Do not launch or modify Gamut Launcher Stable.

## Final review and handoff

1. Review the branch diff for data-path regressions and run the normal code-review pass before asking the user to test.
2. Commit only chart-related source, tests, and documentation to `codex/charts-dev`.
3. Give the user the Dev build location and a short visual checklist: seven-day chart, zero-day baseline, More details ranges, time format, and no change to Stable data.
4. Wait for explicit approval after Dev testing before merging, publishing a Stable release, or invoking the Stable auto-updater.
