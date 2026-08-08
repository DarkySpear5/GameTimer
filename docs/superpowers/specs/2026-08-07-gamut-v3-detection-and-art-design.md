# Gamut v3 — game detection, session stats, and automatic art

Date: 2026-08-07
Branch: `dev` (off `v2`)
Target: one public release, **v3.0.0**

## Why

Gamut's value is that its playtime number is honest. Steam reports "the process
was open"; Gamut reports "you were playing." A real example from the author:
Metro Exodus finished in **19 hours** of actual play, which Steam recorded as
**50 hours**, because being pulled away mid-game without a save point is normal.

Everything in this spec has to protect that distinction. Any feature that makes
the headline number less trustworthy is wrong, no matter how convenient.

Three things are being added:

1. **Session stats** — how many times you sat down with a game, and for how long.
2. **Automatic cover art and backgrounds**, with no account and no server.
3. **Game detection and launching**, so Gamut knows what you're playing.

## Constraints

These came from the author directly and are not negotiable:

- **No hosted backend.** Nothing to run, nothing to pay for, no install phoning
  home to author-controlled infrastructure.
- **No account, no API key, no sign-up.** Art fetching must work out of the box
  for a user who just installed the app.
- **Non-Steam games must work too**, not just Steam-installed ones.
- **Nothing may be confusing to a non-technical user.** Specifically: no asking
  someone to locate a `.exe` themselves.
- **Auto-starting the timer defaults to off**, for the accuracy reason above.

## Why not IGDB

The original idea was IGDB. It was rejected for cause:

- IGDB authenticates through Twitch OAuth requiring a **Client Secret**. Shipping
  one inside an Electron app means anyone can extract it from the asar, and
  Twitch can revoke it.
- IGDB's own developers state API users are expected to have a backend calling
  the service: *"You can build mobile or desktop apps, but they should not
  connect directly to our API."* — <https://api-docs.igdb.com/>
- The compliant alternative is a proxy server, which violates the no-hosting
  constraint and becomes an abuse target once the repo is public.

## Verified alternative

All three of these were checked empirically on 2026-08-07 and need **no key, no
account, and no server**.

| Purpose | Endpoint | Verified |
|---|---|---|
| Name → appid (fuzzy) | `steamcommunity.com/actions/SearchApps/<name>` | `"field of mistria"` (typo, singular) → **Fields of Mistria**, appid 2142790 |
| Cover art | `cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900.jpg` | HTTP 200, `image/jpeg`, 76 KB |
| Background | `.../library_hero.jpg` | HTTP 200, `image/jpeg`, 250 KB |
| Logo | `.../logo.png` | HTTP 200, `image/png` |

The `SearchApps` endpoint is fuzzy, which matters — it corrects the kind of typo
a user or an `.exe`'s metadata will realistically contain.

A game does **not** need to be installed through Steam for this to work. It only
needs to exist in Steam's catalog, which covers the overwhelming majority of PC
games including Epic, GOG and itch releases.

**Fallback:** games with no Steam listing at all (emulated, obscure indie) keep
today's manual icon/background picker. No provider is added for them in v3.
[SteamGridDB](https://www.steamgriddb.com/) is the candidate if this ever proves
insufficient, but it needs a per-user API key and therefore breaks the
no-account constraint as a default.

## Identifying a game

There are two distinct paths, and they have different confidence levels. This
distinction drives the UI, so it is not an implementation detail.

### Path A — Steam-installed: exact, silent

If the `.exe` path contains `steamapps\common\<folder>`, find the
`appmanifest_*.acf` in that library whose `installdir` equals `<folder>`. It
yields the **exact** appid and official name. No guessing, no confirmation, no
network call.

Verified against a real 13-game library on 2026-08-07: folder `AbioticFactor` →
appid 427410, matching the manifest exactly.

This path covers the majority of real usage.

### Path B — everything else: guess, then confirm

For Epic / GOG / itch / standalone games there is no manifest, so a name has to
be guessed and looked up. Candidate name, best signal first:

| # | Signal | Quality |
|---|---|---|
| 1 | Parent folder name | Reliable — correct for essentially every game measured |
| 2 | Window title | Usually good, sometimes decorated with subtitles or FPS counters |
| 3 | `.exe` filename | Weak but better than nothing |
| 4 | `.exe` version resource `ProductName` | **Unreliable — do not trust** (see below) |

The candidate goes to `SearchApps`. **The result is shown to the user with its
cover art for confirmation**, with a search box to correct it. It is never
applied silently.

### Why `ProductName` is demoted

It was the original plan and measurement killed it. Across 13 installed games:

| Result | Count | Examples |
|---|---|---|
| Correct | 5 | Destiny 2, Fields of Mistria |
| Empty | 3 | Abiotic Factor, Dead by Daylight, Marvel Rivals |
| **Actively wrong** | 4 | Stardew Valley → `SMAPI`, Palia → `BootstrapPackagedGame`, Mabinogi → `Nexon Steam Connector` |

Right less than half the time, and confidently wrong a third of the time.

### Why confirmation is mandatory on Path B

Two measured failure modes, pulling in opposite directions:

- **Garbage fails closed.** `BootstrapPackagedGame`, `SMAPI` and
  `Nexon Steam Connector` all return *no match*. A bad signal yields no art
  rather than wrong art — the safe direction, and it needs no handling.
- **But plausible input can fail open.** `MarvelRivals` returned **Marvel Rivals
  Playtest** (2936120) rather than the real game (2767030). Fuzzy search will
  confidently hand back demos, playtests, soundtracks and sequels.

The second is why silent application is not acceptable on Path B. It costs the
user one glance at a cover image, and only for non-Steam games.

Name search also simply misses sometimes: `Metro Exodus Enhanced Edition`
returns no match at all, despite being an owned, installed game. It resolves
perfectly via Path A. This is the concrete argument for keeping the manifest
lookup as its own path rather than routing everything through search.

Every resolution stores its `steamAppId` so it happens once, not on every launch.

### Launching, and why the `.exe` is not the launch mechanism

When an appid is known, launch via `steam://rungameid/<appid>` rather than
spawning the `.exe`. Steam then applies the game's configured launch options,
which is what correctly starts Stardew Valley **through SMAPI** and Marvel Rivals
**through its launcher**. Spawning the raw `.exe` would bypass that and can break
modded or launcher-fronted games.

`exePath` is still stored — it is what background detection matches against, and
it is the launch fallback when no appid exists.

## The two time metrics

This is the part most likely to confuse users, so the rule is strict:

**"Played" is the only playtime that appears anywhere outside the More Info
window.** Game list, Data tab, completion snapshot — all tracked time, all
unchanged from v2.

Game-open time appears **only** inside More Info, subordinate, and always
accompanied by the idle figure that explains it:

```
Metro Exodus Enhanced

  Played                    18:54:45      ← the number
  ─────────────────────────────────────
  Game was open             50:12:03
  Idle / AFK                31:17:18        (62% of the time it was running)

  Sessions                        41       avg 27m · longest 3h 12m
  Launches                        17
```

The idle line is what makes this safe. Without it a reader sees two competing
playtimes; with it they see *"Steam would have said 50 — here is where the other
31 went."* The gap stops being a contradiction and becomes the app's argument
for itself.

This is also self-limiting by physics: open time can only be known when Gamut
launched the game or detection is enabled, so it is frequently absent and can
never drift into being the headline.

## Sessions vs launches

They are different numbers and both are shown, separately.

- **Session** — one Play → Pause cycle. Incremented when the user presses Play.
  Free: no polling, no `.exe`, works for every game on day one.
  - A session is **closed** by Pause, by switching games, or by the app quitting
    while the timer runs. The existing 5-second checkpoint already persists the
    elapsed time, so a power cut loses at most the last 5 seconds of the session,
    never the session itself.
  - Sessions under **60 seconds are recorded but not counted** toward the session
    total or the average. A misclick on Play should not inflate "times played" or
    drag the average down. They stay in `sessionLog` (flagged) so the data is
    never silently thrown away.
- **Launch** — the game process actually started. Requires either Gamut having
  launched it, or background detection being on.

The gap between them is meaningful: "launched 17, played 12" means five times
the game was opened and abandoned.

### How a launch gets counted

| How it happened | Counted | Cost |
|---|---|---|
| User pressed **Play Game** in Gamut | Exact | Free — Gamut owns the process handle |
| Launched externally, detection on | Yes | Polling, opt-in |
| Launched externally, detection off | No | — |

Because launching from Gamut is exact and free, **polling is genuinely
optional.** A user who launches from Gamut gets perfect counts with nothing
running in the background.

## Data model

Added to each profile. No existing field changes meaning, so v2 save files
upgrade with zero risk — `seconds` and `statusSeconds` remain tracked time.

| Field | Type | Notes |
|---|---|---|
| `sessions` | number | +1 on Play |
| `sessionLog` | `{ startedAt: number, seconds: number, short?: true }[]` | Every session, kept forever. `short` marks sub-60s sessions excluded from counts and averages. |
| `launches` | number | +1 on a confirmed launch |
| `openSeconds` | number | Total process-open time, when known |
| `exePath` | string \| null | Set by the Add Game picker |
| `steamAppId` | number \| null | Resolved once, then cached |
| `autoFetchArt` | boolean \| null | `null` = follow the global setting |
| `autoStartTimer` | boolean \| null | `null` = follow the global setting |

**Derived, never stored:** average session, longest session, first played, last
played, idle time. All computed from `sessionLog` so they cannot drift out of
sync with reality.

`sessionLog` is unbounded by decision. At roughly 50 bytes per entry, three
sessions a day for five years across a whole library stays under ~300 KB, and
the save file is already loaded wholly into memory. Capping it would silently
turn "average session" into "average of recent sessions" and would make a
lifetime history graph impossible to add later.

Both `autoFetchArt` and `autoStartTimer` are **tri-state** (`true` / `false` /
`null`). `null` means "follow the global default", so a user who flips the
cogwheel setting changes every game that hasn't been explicitly overridden.

## Settings

**Global (cogwheel):**

- Auto-fetch cover art — default **on**
- Auto-start timer when a game launches — default **off**
- Watch for games in the background — default **off**

**Per game (Modify):** the same two auto-fetch / auto-start switches, each
defaulting to "follow global".

## UI changes

### Add Game — two buttons, no file paths

- **Detect running game** → a grid of currently-running applications showing each
  one's real `.exe` icon and window title. Likely games sorted first (anything
  under `steamapps\common\`, `Epic Games\`, `GOG Galaxy\Games\`); launchers and
  OS processes filtered out. Click a tile → name filled in, art fetched, `.exe`
  and appid linked. Steam-installed games (Path A) complete silently; anything
  resolved by name search (Path B) shows the matched cover for a one-click
  confirm first.
- **Add manually** → today's type-a-name box, unchanged.

Deliberately **no "browse for .exe" option** — it is the confusing one, and the
picker makes it unnecessary. Multiple games running at once is a non-issue: they
are simply two tiles.

Feasibility was checked on the author's machine: **7 processes with visible
windows**, all resolving a full `.exe` path. The picker is a short list, not a
process explorer.

### More Info window

Reached by right-clicking a game (the context menu already exists). Layout as
shown above. **The Data tab table itself does not change** — this is additive.

### Modify dialog remaster

Modify already has four tabs (general / time / appearance / genres) at 340
lines, and v3 adds per-game art and detection settings to it. It gets restructured
as part of stage 2 rather than having switches bolted on.

### Play Game button

Above the timer in the selected-game view. Uses `steam://rungameid/<appid>` when
an appid is known, otherwise spawns `exePath`. Hidden when neither is set.

## Fixed along the way

**Completion state is destroyed by a misclick.** In `profileService.setStatus`,
setting a game back to `in_progress` nulls both `statusAt` and `statusSeconds`,
and `SelectedGameView.toggleComplete` calls exactly that when Complete is clicked
on an already-completed game. One stray click permanently erases a game's
completion date and completion-time snapshot, with no confirmation and no undo.

This is a **live bug in v2.1.11**, not a v3 item, so it does not wait for v3.
It is fixed on `v2` and shipped as **v2.1.12**; `dev` inherits it by merge. Users
on the current build should not be one misclick from losing a completion record
for however long v3 takes.

Fix: un-completing preserves the snapshot. Clearing it becomes a deliberate,
separate action behind an irreversible-action confirmation.

## Release process

`dev` is the working branch. `v2` remains the public release branch and keeps
receiving 2.x patches. When v3 is stable, `dev` is promoted to a `v3` branch which
becomes the repo default — mirroring how `v2` succeeded `main`.

> **Auto-updater trap.** `electron-builder.yml` sets `releaseType: release`. Any
> v3 build published with that setting will be pushed to **every v2.1.11 user**,
> because electron-updater takes the newest non-prerelease. Dev builds must be
> published as a **prerelease** (electron-updater skips those by default) or not
> published at all — run the packaged `.exe` locally instead.

## Staging

One public v3.0.0, built in three ordered stages on `dev`. Each is verified before
the next begins.

0. **v2.1.12 patch on `v2`** — the `setStatus` completion-wipe fix, released
   immediately and merged into `dev`. Not part of v3.
1. **Stats.** Sessions, session log, More Info window, the deliberate
   clear-completion action. No network, no polling, no process access. Works on
   every existing game the day it lands.
2. **Identity & art.** Add Game picker, exe/appid linking, Steam art fetch and
   caching, the settings, Modify remaster.
3. **Launching & detection.** Play Game button, launch counting, open/idle time,
   opt-in background detection, opt-in auto-start.

Stage 1 is first because it is the only stage with no external dependency — if
Steam changes a URL, stages 2 and 3 wobble and stage 1 does not care.

## Testing

Per existing project practice, verification runs the real packaged app under
Playwright and drives it through actual clicks.

Test launches **must** be isolated from real save data: patch
`electron.app.getPath("appData")` in the built `out/main/index.js` to honour a
`GAMUT_TEST_APPDATA` override, and seed a scratch profile directory. Setting the
`APPDATA` environment variable does **not** work — Electron resolves `appData`
through the Windows shell API, and `src/main/index.ts` pins `userData` on top of
that regardless.

Network-dependent code (art fetch, appid resolution) must be tested against
recorded fixtures, not live Steam endpoints, so the suite stays deterministic and
runs offline.

## Explicitly out of scope

- SteamGridDB or any other keyed art provider.
- Importing a whole Steam/Epic library at once.
- Genre, release-date or rating metadata from any external source — genres stay
  user-assigned.
- Retroactive stats. There is no session history in existing save files, so
  counters start at zero on upgrade. This is stated in the release notes rather
  than faked.
- Achievements, friends, or anything requiring a Steam account.
