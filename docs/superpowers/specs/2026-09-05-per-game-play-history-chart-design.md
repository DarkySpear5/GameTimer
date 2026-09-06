# Per-Game Play-History Chart Design

## Goal

Show a themed per-game chart of active playtime by local calendar day: a
seven-day overview on the Library game-detail page, plus a larger dialog for
Month, Year, and All Time. The chart must remain exact for every day Gamut
records in the future without retaining unlimited individual session entries.

## User experience

- The game-detail page gains a **Play history** card in the blank area under
  the game summary. It shows seven local calendar days as bars, including a
  zero-height baseline for days with no play. Hovering/focusing a bar reveals
  its date and duration.
- **More details** opens a modal with Month, Year, and All Time range buttons.
  The modal uses the same chart, with adaptive buckets: day for Month, week
  for Year, and month for All Time. A range with no play still renders a
  visible zero baseline rather than an empty or invented bar.
- Charts use Gamut's existing CSS theme variables for panel/card backgrounds,
  text, muted text, accent stroke/fill, and zero baseline. They do not add a
  charting dependency.
- Gamut Launcher Dev exposes a **Preview chart** action only in the Dev
  channel. It renders fixed sample history in renderer memory and never calls
  IPC or writes a profile, so the simulation cannot touch Dev or Stable game
  data.

## Permanent data model

Each `Profile` gains `playHistory`:

```ts
interface PlayHistory {
  /** A truthful carry-forward total that predates daily tracking. */
  baseline: { date: string; seconds: number } | null
  /** Exact active seconds recorded by Gamut for each local YYYY-MM-DD. */
  dailySeconds: Record<string, number>
}
```

`dailySeconds` is deliberately a compact daily aggregate, not an unlimited
raw session list. Five years of daily data is about 1,826 number entries per
actively played game, while an unbounded session log can reach tens of
thousands of entries and is serialized on checkpoints. `sessionLog` remains
capped at 200 because session counts, averages, and longest-session metrics
already use the permanent `sessionStats` aggregate.

## Migration and data integrity

- Existing profiles receive one `baseline` exactly once. Its seconds equal the
  current `profile.seconds`; its date is `startedDate`, then the local date of
  `sessionStats.firstPlayedAt`, then the migration date. No old day is filled
  with zero or guessed values.
- The baseline is rendered as **Earlier playtime** with a distinct striped
  fill and a tooltip explaining that its total predates daily tracking. It is
  anchored to the chosen date to preserve the user's existing Started On
  context, but never described as hours played on that one day.
- Every post-migration timer delta is split across local midnight boundaries
  and added to `dailySeconds`. A session crossing midnight therefore credits
  each real day correctly. Checkpoints and crash recovery use the same split
  helper, so a crash cannot make `profile.seconds` grow without the chart
  history catching up.
- Manual Add/Remove Time changes adjust the baseline because they have no
  trustworthy real-world date. Reset Time clears `playHistory`; duplicate
  copies it; profile import gets a fresh baseline from the imported total.
- Schema defaults missing/corrupt `playHistory` safely and migration is the
  only route that writes the baseline. No migration deletes, moves, or
  recreates profiles.

## Architecture

- `src/shared/playHistory.ts` owns pure local-date splitting, baseline
  migration, daily aggregation, and chart-bucket generation. It is tested
  without Electron or React.
- Store schema/types and each service that changes `profile.seconds` call the
  shared helper. This keeps the chart ledger aligned with the canonical total.
- Renderer components receive a `PlayHistory` plus display-range configuration
  and draw a small accessible SVG chart. The detailed dialog is registered in
  the existing UI dialog store and `App.tsx`.
- The Dev preview supplies a frozen fixture directly to the chart component;
  it bypasses DataStore, profile services, and IPC completely.

## Constraints and acceptance criteria

- Stable data remains untouched while work is tested only in the Dev channel.
- No subscription or paid chart library is added.
- All Time means all history recorded by this feature plus the explicitly
  marked pre-chart baseline; no unrecorded dates are fabricated.
- The seven-day view, detailed ranges, theme changes, midnight split,
  recovery, import, duplication, manual adjustment, and reset are covered by
  tests.
- Dev simulation is demonstrably in-memory and launches without adding a game
  or saving any data.
