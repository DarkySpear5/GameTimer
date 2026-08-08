# Gamut v3 — Roadmap & Full Context Handoff

> **Read this first, completely, before touching anything.** It is written for a
> session with no memory of the work that produced it. Everything needed is
> here: current state, what is already built, decisions and the reasons behind
> them (including two that were reversed by measurement), verified external
> facts, testing method, traps, and the remaining work.
>
> Written 2026-08-08 at the end of a long session, at the user's request, so the
> conversation could be cleared and resumed from this file.
>
> **Revised the same day** with the user's answers and additions: the Library
> navigation model (§9.2), sorting + favourites (§9.3), auto-detecting installed
> games (§9.4), and two closing passes they asked for — security (§12) and
> memory (§13). No open questions remain.

---

## 0. How to use this document

- **§1–§3** is orientation. Read it.
- **§4** is what already exists — do not rebuild any of it.
- **§5** is externally verified facts. **Do not re-derive these**; they cost real
  time to establish and several are counter-intuitive.
- **§6** is decisions + rationale. Read before changing any of them; two were
  already reversed once by measurement and the reasoning is recorded so it is
  not re-litigated from the original wrong argument.
- **§7** is how to test. The isolation trick is mandatory.
- **§8** is traps that have already bitten.
- **§9 is THE WORK.** Start here after reading the rest.
- **§12 (security) and §13 (memory)** are the final two passes, requested by the
  user and deliberately sequenced *after* §9 so they audit the finished code.
  Both open with a list of what has already been audited or optimised — read
  those before doing anything, they exist to stop the work being repeated.

---

## 1. Project facts

| | |
|---|---|
| Local repo | `C:\Users\ericd\OneDrive\Documents\GamerTimer` |
| GitHub | `DarkySpear5/Gamut` — **public**, `gh` CLI authenticated |
| App | Gamut — Windows game-playtime tracker, Electron 37 + TypeScript + React 19 + Zustand + zod 4 + Tailwind 4 |
| Node on this machine | **18.20.8** — pin dev deps accordingly (Vitest is `^2.1.9` for this reason) |
| i18n | 10 locales: `en de es fr it ja ko pt ru zh`. Every user-facing string, no exceptions. |

**Branches — named for role, restructured 2026-08-07:**

| Branch | Holds |
|---|---|
| `main` | Gamut as released. Repo default. Every tag and auto-update ships from here. |
| `dev` | v3 in progress. **Work here.** ~31 commits ahead of `main`. |
| `v1` | Frozen Python/Tkinter edition (v1.9.1). Do not touch. |

**Released publicly:** `v2.1.13` (security fix — see §4.6). **v3 is unreleased.**

**Build commands:**

```bash
npm run typecheck     # must pass clean before every commit
npm test              # Vitest, currently 77 tests
npm run build         # electron-vite
npm run package       # public installer -> release/
npm run package:dev   # side-by-side dev installer -> release-dev/
```

---

## 2. Non-negotiable principles

These come from the user directly. Violating any of them is wrong regardless of
how convenient it is.

1. **Accuracy is the product.** Steam measures "the process was open"; Gamut
   measures "you were playing." The user finished Metro Exodus in **19 hours**
   of real play, which Steam recorded as **50**. Tracked time (Play→Pause) is
   the only playtime shown as *the* number. Auto-starting the timer defaults
   **off** for this reason — it is a product decision, not caution.
2. **No hosted backend, no account, no API key.** Nothing to run, nothing to pay
   for, no install phoning home to author infrastructure. This is what ruled out
   IGDB, SteamGridDB and RAWG.
3. **The app must work fully offline.** Every network call is best-effort inside
   a try/catch. Offline is a normal outcome, never an error dialog.
4. **Existing save files must always load.** Every new field gets a zod
   `.catch()` default. The store's contract is "never reject a file for being
   partial", inherited from v1.
5. **First-time clarity is now an explicit goal.** The user's words: a product
   handed to a random person must be understandable with a new eye. Their
   framing — a friend demoed software that made sense to him and confused
   everyone else, because he knew it. The user now knows Gamut too well to see
   it fresh. **When in doubt, favour the newcomer.**

---

## 3. Where the user is

They have been testing via `npm run package:dev` (side-by-side install, own save
folder). They are hands-on, give terse multi-part feedback, and reliably spot
real problems. They have approved the plan in §9 in principle and asked to be
shown the result rather than consulted step by step:

> "You had good idea earlier so I could maybe let you get through this and let me
> present what you made after?"

So: build §9, verify it, show them. Do not stop to ask about details already
settled here.

**There are no open questions left.** The one this document originally carried —
how Library and Timer navigate to each other — was answered by the user on
2026-08-08 and is written up in §9.2, along with the reason the answer differs
from what this document first recommended. In the same message they added the
sorting/favourites work (§9.3), the auto-detect feature (§9.4), and asked for a
security pass (§12) and a memory pass (§13) once the rest is done. Everything
they have asked for is now specified below.

---

## 4. What already exists — do NOT rebuild

### 4.1 Session stats (v3 stage 1)
- Session = one Play→Pause cycle. Recorded in `timerEngine.pause()`.
- `MIN_SESSION_SECONDS = 60`: shorter cycles are logged but excluded from counts
  and averages, so a misclick on Play cannot inflate "times played".
- `sessionStats` aggregate per profile (`count`, `totalSeconds`,
  `longestSeconds`, `firstPlayedAt`, `lastPlayedAt`) — **this is what the UI
  reads.** `sessionLog` holds only the most recent `MAX_SESSION_LOG = 200`
  entries, for a future history graph. See §6.2 for why.
- `src/shared/sessionStats.ts` is pure and unit-tested.

### 4.2 Detection & identity (v3 stage 2)
- `detect/processList.ts` — running windowed apps + real `.exe` icons via
  `app.getFileIcon`. Pure filtering/ranking split into `processFilter.ts`.
- `detect/steamLibrary.ts` + `steamVdf.ts` — Steam root via `reg.exe`, library
  roots from `libraryfolders.vdf`, games from `appmanifest_*.acf`.
- `detect/identify.ts` — **two paths, different confidence:**
  - **Path A**: exe under `steamapps\common\<dir>` → manifest → *exact* appid,
    applied silently.
  - **Path B**: anything else → guess a name → search → **must be confirmed by
    the user**. See §5.2 for why this is not optional.
- `detect/candidateName.ts` — name guessing. Folder name first; `.exe`
  `ProductName` is **deliberately never used** (§5.3).
- `detect/matchHit.ts` — exact-title matching. Doubles as the "is this a game"
  classifier (§5.2).
- `detect/classify.ts` — promotes unclassified apps in the picker if Steam
  confirms them. Promotion only; a "no" never hides anything.
- `detect/gameWatcher.ts` — opt-in 10s polling. Counts launches, accrues
  `openSeconds`, optionally auto-starts/pauses the timer.
- `launch/gameLauncher.ts` — `steam://rungameid/<appid>` when an appid is known
  (§5.4), else spawns the exe detached.

### 4.3 Art & metadata
- `art/steamArt.ts` — keyless search, art with a fallback chain, genres.
- `art/gogCatalog.ts` — GOG as the second source for non-Steam games.
- `art/enrich.ts` — orchestrates Steam → GOG → nothing.
- `art/genreMap.ts` — maps user tags onto Gamut's 51 genres.
- `art/artOptions.ts` — every candidate image, HEAD-checked so dead URLs are
  never offered.
- `art/allowedHosts.ts` — CDN allowlist, shared by the thumbnail proxy and the
  downloader.
- Art goes through the existing `saveCappedImage*` size caps (icons 256px,
  backgrounds 2560px) into the same directories as manually chosen images.

### 4.4 UI as it stands
- **Tabs:** `Timer | Data | About` + cogwheel. `Timer` = sidebar game list +
  big-clock view. **This structure is what §9 replaces.**
- `AddGameDialog` — two routes: *Detect running game* (shared
  `RunningAppPicker`) and *Add manually*. No "browse for .exe" — deliberately
  rejected as the confusing option.
- `GameInfoDialog` — "More info", right-click. Played as hero; Game open / Idle
  below with an explanatory caption.
- `ModifyDialog` — tabs General / Time / Icon & Background / Genres. Contains
  the art picker, the `.exe` link control, per-game auto-start, genre lock.
- `DataTab` — sortable columns, own zoom (`dataTableScale`, default 1.15),
  right-click → Modify / More info / Notes.
- `SettingsDialog` — `General | Games | Appearance | Language`. UI folded under
  Appearance.

### 4.5 Dev channel
`npm run package:dev` builds `GamutDev-Setup-<v>.exe`, installing **alongside**
the public app. Separate `appId`, productName "Gamut Dev", `release-dev/` output,
own `%APPDATA%\gametimer-dev` save folder, updater hard-disabled. Channel baked
in as `__GAMUT_CHANNEL__` (Vite define) and read via `src/shared/channel.ts`.

**Why it exists:** v3 writes save fields v2 does not know, and the zod schema
strips unknown keys — a shared save folder would silently delete v3 data the next
time public Gamut opened.

### 4.6 Security fixes (shipped as v2.1.13)
Two path traversals, both since v2.0, both in import paths:
- `.gtprofile`: image extension taken verbatim from the file into a path.
- v1 legacy import: the icon filename used for **both** the read and the write —
  arbitrary read *and* write.
- Amplified by `saveCappedImage*` copying non-decodable input through unchanged,
  so the attacker chose the contents too.

Fixed via `importer/safeExt.ts` + `util/safePath.ts` (allowlisted extension,
basename only, `isInside` check) and by rejecting input that does not decode as
an image. Also hardened `setWindowOpenHandler` to http/https and gave
`setArtFromUrl` the CDN allowlist.

**Audited and found sound:** `contextIsolation: true` / `nodeIntegration: false`;
PowerShell and `reg.exe` receive fixed argument arrays (no injection);
`steam://rungameid/${id}` is a zod-validated number; `exePath` is deliberately
**not** exported in `.gtprofile` so a shared profile cannot aim Launch at
someone else's binary.

**Residual, by design:** the Launch button runs whatever path is in the save
file. Not privilege escalation (anyone who can write AppData can already run
code as the user) but the save file is now security-relevant.

---

## 5. Verified external facts — DO NOT RE-DERIVE

All measured 2026-08-07/08. All keyless, no account.

### 5.1 Endpoints that work
| Purpose | Endpoint |
|---|---|
| Name → appid (fuzzy) | `https://steamcommunity.com/actions/SearchApps/<name>` — also returns a **square community icon** URL, the only genuinely square art Steam exposes |
| Art | `https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/{library_600x900,library_hero,header,capsule_231x87,capsule_616x353,logo.png,page_bg_generated_v6b}` |
| **User tags** (rich genres) | `https://steamspy.com/api.php?request=appdetails&appid=<id>` |
| Store genres (coarse fallback) | `https://store.steampowered.com/api/appdetails?appids=<id>&filters=genres` |
| Screenshots | same appdetails with `filters=screenshots` — 16 for Stardew |
| Non-Steam games | `https://catalog.gog.com/v1/catalog?limit=10&query=like:%20<name>` — returns title, `coverVertical`, `coverHorizontal`, `galaxyBackgroundImage`, genres |

`GetAppList/v2` is **404** — do not use it.

### 5.2 SearchApps is a SUBSTRING matcher, not a relevance ranker
Its first result is frequently the wrong thing:

```
"Hollow Knight" -> [Hollow Knight: Silksong, Hollow Knight]   <- wrong first
"Palworld"      -> [Palworld, Palworld: Palfarm, Pal♡world!]
"Claude"        -> [Claude Monet…, Meet Claude, World of ClaudeCraft]
"Discord"       -> [Discord Bot Maker, Bot Maker For Discord]
"MarvelRivals"  -> Marvel Rivals Playtest   (before PascalCase splitting)
```

**An exact normalised title match is the only reliable signal.** That single rule
does two jobs: picks the right appid, and classifies whether the thing is a game
at all — "Claude" and "Discord" return plenty of hits but never themselves. This
is `matchHit.ts`. Taking `hits[0]` was a real bug that resolved Hollow Knight to
Silksong.

### 5.3 `.exe` ProductName is unreliable — measured over 13 installed games
Right 5, empty 3, **actively wrong 4**: Stardew Valley reports `SMAPI`, Palia and
Funnel Runners report `BootstrapPackagedGame`, Mabinogi reports
`Nexon Steam Connector`. The **containing folder name** is right essentially
always. Never trust ProductName.

### 5.4 Steam asset coverage is uneven
appid 3600 (a 2007 title) **404s** on `library_600x900`, `library_hero` and
`logo.png` while serving `header.jpg` and `capsule_231x87` fine. Hence the
fallback chains and the HEAD-check in `artOptions`.

### 5.5 Launch via `steam://rungameid`, not the exe
Steam applies the game's configured launch options — that is what correctly
starts Stardew Valley **through SMAPI** and Marvel Rivals **through its
launcher**. Spawning the raw exe bypasses that and breaks modded games.

### 5.6 Store genres are far too coarse; user tags are exactly right
`appdetails` returns DOOM Eternal as simply **"Action"**. SteamSpy user tags
return **FPS, Action, Gore, Shooter, Sci-fi** — the same vocabulary Gamut's
51-tag list was written in. Normalising case and punctuation makes most tags
match with no table at all.

### 5.7 Memory measurements (40 games, 2 years of history)
| | Unbounded log | Aggregate + 200 entries |
|---|---|---|
| Save file | 3.29 MB | **0.68 MB** |
| Main process | 131 MB | **109 MB** |

Art on every game costs only **+12MB** for 40 games — not the problem. The
256px icon cap from v2.1.5 is doing its job.

### 5.8 Process enumeration
`Get-Process | Where MainWindowTitle -ne ''` returns ~4–7 rows on a normal
desktop, all with a resolvable `Path`. `app.getFileIcon` returns a non-empty
32–48px icon in ~80ms per exe.

---

## 6. Decisions and their reasons

### 6.1 IGDB was rejected — do not revisit without new information
It needs a Twitch **Client Secret**, which cannot be shipped inside an app, and
IGDB's own docs say desktop clients should not call their API directly. Replaced
by the keyless Steam + GOG chain in §5.1.

### 6.2 REVERSED: sessionLog is bounded, aggregates are the truth
Originally the log was unbounded, argued on the grounds that capping it would
turn "average session" into "average of recent sessions". **Measurement showed
that was both expensive and wrong** (§5.7). Every displayed figure — count,
average, longest, first, last — is an aggregate; none needs the individual
entries. Aggregates keep all of them exact for the lifetime of the game *and*
the log stays small. Migration folds existing logs once on load, detected by
`firstPlayedAt === null` on a non-empty log.

### 6.3 REVERSED: the idle figure is explained, not hidden
When the user asked "what triggered the idle 11%?", the initial read was "the
number is noise, suppress it on short sessions". Wrong. The user's own
clarification: *"it was the time the game ran without the game timer being
active"* — which is exactly what it measures and is the figure that demonstrates
why their playtime is truer than Steam's. **The problem was labelling, not
data.** There is now an explanatory caption. Do not suppress this line.

Residual caveat, stated in the caption: the watcher samples every 10s, so on a
very short session most of the gap is sampling rather than real idle.

### 6.4 Genres: fetched genres lock the picker, with an Unlock
The user asked for detected games' genres to be unmodifiable. Implemented as
locked-with-Unlock rather than a hard lock, because these sources are good but
not infallible and being stuck with a wrong set is worse than the accidental
edit the lock prevents. Editing at all hands ownership back to the user
(`genresFromDetection = false`).

### 6.5 Auto-start defaults OFF, background watching defaults OFF
See §2.1. Both are separately opt-in, global setting plus tri-state per-game
override (`null` = follow global).

### 6.6 No "browse for .exe" option
Deliberately rejected — asking a non-technical user to locate a game's
executable is the confusing path, and the running-app picker makes it
unnecessary.

---

## 7. How to test — the isolation trick is mandatory

**Test launches otherwise read and write the user's REAL save data.** Setting
the `APPDATA` env var does **not** work: Electron resolves `app.getPath('appData')`
through the Windows shell API, and `src/main/index.ts` pins `userData` on top of
that regardless.

The only method that works — patch the built bundle after building:

```bash
npm run build && node -e "const fs=require('fs');const f='out/main/index.js';let s=fs.readFileSync(f,'utf8');s=s.replace('electron.app.getPath(\"appData\")','(process.env.GAMUT_TEST_APPDATA || electron.app.getPath(\"appData\"))');fs.writeFileSync(f,s);"
```

then launch with `env: { ...process.env, GAMUT_TEST_APPDATA: '<scratch>' }` and
seed `<scratch>/gametimer/game_timer_data.json` plus
`firstrun.json` = `{"legacyImportState":"skipped"}`.

**`npm run package` and `npm run package:dev` rebuild `out/`, so the patch never
reaches a release.** Verify with `grep -c GAMUT_TEST_APPDATA out/main/index.js`
→ must be `0` before shipping.

**Drive the UI through real clicks, not raw IPC.** `window.api.*` called directly
from a test bypasses the renderer's Zustand sync, so the store never learns about
the change and the UI shows nothing. If you must seed via IPC, `win.reload()`
afterwards so `getInitialData` re-syncs.

**Prove a test can fail.** Every fix in this project was validated by reverting
it (`git checkout <prev-commit> -- <file>`, rebuild, re-run) and confirming the
test catches it. `git stash` does **not** work once the change is committed — it
silently no-ops and the suite runs against the fixed code and "passes".

Existing suites: `scripts/verify-stage1.cjs` (session/completion end-to-end),
plus 77 Vitest unit tests.

---

## 8. Traps that have already bitten

1. **CSS `zoom` breaks `position: fixed` children.** The Data tab's zoom made the
   context menu appear 15% further down the page than the cursor. The zoom must
   stay on an inner wrapper with `fixed`-positioned things rendered outside it.
2. **The renderer's CSP forbids remote images** (`img-src 'self' gt-asset: data:`).
   Do not relax it to `https:`. Remote thumbnails go through
   `gt-asset://remote/<encoded-url>` with a host allowlist.
3. **Gamut listed itself in its own picker.** A name denylist catches
   `Gamut.exe` in a packaged build but a dev run's process is called `electron`.
   Exclusion is by `process.execPath`.
4. **`git checkout dev -- .` will silently revert files you just wrote.** Cost
   two files in this session.
5. **Backslashes get mangled through bash heredocs and `python - <<EOF`.** Use
   the Write/Edit tools for anything containing `\`, or a helper like
   `basename()` that avoids the literal.
6. **A running Gamut Dev locks `release-dev/win-unpacked`**, so
   `npm run package:dev` fails with `EBUSY`. Close it first.
7. **`electron-builder.yml` has `releaseType: release`.** Publishing a v3 build
   with that setting pushes it to **every v2.x user**. Dev builds must never be
   published to that feed; `electron-builder.dev.yml` has no publish block.
8. **Old releases (v2.1.9 and below) record `target_commitish: v2`**, a branch
   that no longer exists. Cosmetic only — electron-updater resolves by tag.
9. **`firstrun.json` existing *at all* is what suppresses the v1 import prompt.**
   `detectLegacyLibrary()` (`src/main/importer/legacyImport.ts:165`) does
   `if (firstRun) return { found: false }` — it never inspects the contents. So
   the §9.4 auto-detect prompt **must not** write that file before the legacy
   import has had its turn, or a user upgrading from v1 silently never gets
   offered their old library and it looks like their data is gone. Add a field
   to `FirstRunState` (`src/main/importer/firstRun.ts`) — e.g.
   `installedScanState` — and make the legacy check test *its own* field rather
   than the file's existence. There is a v1 install on this machine to test
   against; verify both prompts still appear on a fresh profile, in order.

---

## 9. THE WORK — information-architecture redesign

**Goal, in the user's words:** the software should be understandable "with a new
eye", less cluttered for a first-time user. Everything below serves that.

The user has approved this direction and asked to be shown the result rather
than consulted per step. Build it, verify it, present it.

**Build order.** §9.0 → §9.1 → §9.2 → §9.3 → §9.4 → §9.5 → §9.6 → §9.7, then
§12 (security) and §13 (memory) once the UI is settled. The order is not
arbitrary: the rename is free and makes every later screen read better, and the
security/memory passes come last so they audit the final code rather than code
that is about to be rewritten.

### 9.0 Prerequisite rename — do this first, it is cheap and everything else reads better

**"Time Completed" → "Time to Beat"** (locale key `col_completed_time`; consider
adding a new key `col_time_to_beat` and retiring the old one in all 10 locales).

Why: `Completed On` (a date) sat next to `Time Completed` (a duration) and a
newcomer reads both as dates. "Time to Beat" is unambiguous and is the phrase
the user themselves used ("howlongtobeat"). This is the single highest
clarity-per-character change available.

### 9.1 New tab structure

Current: `Timer | Data | About`, where `Timer` confusingly contains the game
list. Replace with:

```
Library  |  Timer  |  Stats  |  About            [cogwheel far right]
```

- **Library** — *default tab.* The game collection, Steam-like. **Grid** or
  **List** view toggle. Grid shows fetched cover art; List shows icon + name +
  playtime + status. This is where a game is added, edited, rated, tagged,
  linked to an exe, art-picked, deleted. All management lives here. Clicking a
  game opens its **detail view inside Library** — see §9.2.
- **Timer** — the focused now-playing view. The selected game's big clock,
  Play/Pause, Complete, Launch Game. Keeps a compact game list for switching.
  **Right-click here offers only timing actions** (Play/Pause, Complete,
  Add/Remove time, Reset time) — per the user's request that management moves to
  Library.
- **Stats** — renamed from "Data". Same table.
- **About** — unchanged.

**Rationale for keeping Timer separate** (the user asked for this): the app
supports concurrent timers, so a view dedicated to what is *running now* is
genuinely distinct from browsing a collection. Library answers "what do I have",
Timer answers "what am I playing".

### 9.2 Library detail view — RESOLVED by the user, do not "simplify" it back

> This document originally left the navigation model open and **recommended the
> cheaper option** (clicking a game jumps straight to the Timer tab). **The user
> chose the other one.** Their words, 2026-08-08:
>
> *"Once you launch game it makes you go to timer tab. The library is either grid
> or list view but once you click a game it doesn't launch right away, it focus
> that game inside the 'library' tab. it gives you access to 'Launch game'
> button, and other stuffs you can do here."*
>
> A fresh session reading only the recommendation above would undo this. Don't.
> The rule is the same one that governs §6.2 and §6.3: the recorded decision
> wins over the original reasoning that preceded it.

**The model:**

1. Click a game in the Library grid/list → **stay in Library**, open that game's
   detail view. Nothing is launched, no timer starts, no tab changes. A click is
   navigation, not an action — this is what makes the grid safe to browse.
2. The detail view is the game's home: cover art / hero, playtime, status,
   rating, genres, notes, session stats, and every management action —
   **Launch Game**, Modify, art, link `.exe`, favourite, delete.
3. **Launching** a game (and only launching) **switches to the Timer tab** with
   that game selected. That is the one transition between the two tabs, and it
   is meaningful: you have stopped browsing and started playing.
4. Back returns to the grid/list at the same scroll position and view mode.

**Why this is right despite costing more code:** it separates *browsing* from
*acting*. With the cheap option, every click is a mode switch, so the grid can
never be casually explored — exactly the "confusing to a new eye" problem §2.5
exists to prevent. It also gives the management actions a natural home, which is
what makes the Timer tab's right-click menu safe to reduce to timing-only.

**Watch:** the timer must keep running and keep displaying while the user
browses Library. Concurrent timers already work; the detail view of a *running*
game shows its live clock, and so does the Timer tab. Neither owns the timer —
`timerEngine` does. Do not couple timer state to which view is mounted.

### 9.3 Library sorting and favourites

Requested directly: *"Maybe a sorting option too is good there, Like 'last
played' 'hours played' 'A-Z' 'Z-A' 'Favorite'. Add a star too to add to
favorite."*

**Favourite is a new profile field.** `favorite: z.boolean().catch(false)` in
`ProfileSchema` (`src/main/store/schema.ts`), mirrored in `shared/types.ts`,
with a `profile:setFavorite` IPC and a star control in the Library detail view
(§9.2) and on the grid tile hover. `.catch(false)` per §2.4 — every existing
save file must still load.

**Sorting extends the existing mechanism, it does not replace it.**
`sortAndFilterProfiles` in `src/renderer/src/state/selectors.ts` is the single
sort implementation and is already shared; `SortMode` lives in
`src/shared/types.ts` and the zod enum at `schema.ts:89`. Current values:
`name | last_played | rating | genre`.

Target list:

| Label shown | `SortMode` value | Comparator |
|---|---|---|
| Name (A–Z) | `name` | existing, unchanged |
| Name (Z–A) | `name_desc` | **new** — reverse `localeCompare` |
| Last played | `last_played` | existing |
| Hours played | `playtime` | **new** — `b.seconds - a.seconds` |
| Favourites first | `favorite` | **new** — favourites, then name |
| Rating | `rating` | existing |
| Genre | `genre` | existing |

Three traps here:

1. **Widen the zod enum, keep `.catch('name')`.** A save written by a *newer*
   build and opened by an older one falls back to `name` rather than failing —
   that is the contract in §2.4 working as intended.
2. **Sort by *displayed* seconds, not stored seconds**, or a game that is
   running right now sorts by a stale number. `displaySeconds(profile, running)`
   in the same file already resolves this and must be used by the `playtime`
   comparator.
3. **Every comparator needs `|| byName(a, b)`** as the tiebreaker, as the
   existing ones do. Without it, ties order arbitrarily and the grid appears to
   reshuffle itself on unrelated updates.

All seven labels need strings in **all 10 locales**.

### 9.4 Auto-detect installed games — new feature

Requested directly: *"I'd also like an option to detect games installed on pc and
add it to library automatically. once again this would be a 1st time run ask
option and you decide which you want but can always modify in parameter."*

**Most of this is already built.** `scanSteamLibrary()` in
`src/main/detect/steamLibrary.ts` already returns **every installed Steam game**
across every library folder — name, appid and `installdir`, parsed from each
`appmanifest_*.acf`, cached for a minute. It exists to support the Add Game
picker. Nothing new is needed to *find* Steam games; the work is the import flow
around it. Do not write a second scanner.

**The flow:**

1. **First run** (and only first run) asks once: *"Gamut found N games installed
   on this PC. Add them to your library?"* with the found list shown and
   individually checkable, defaulting to all checked. Plus a **"don't ask
   again"**-style outcome recorded either way.
2. Answering imports the checked games as profiles at **zero playtime**, with
   `steamAppId` set (so art enrichment and `steam://rungameid` launching work
   immediately — §5.5), and art fetched per the existing `autoFetchArt` setting.
3. **Settings → Games** gets a permanent **"Scan for installed games"** button
   that re-runs the same picker on demand. This is the *"can always modify in
   parameter"* half of the request, and it is what makes the first-run prompt
   safe to decline.
4. Re-scans **never duplicate**: match on `steamAppId` first, then on
   normalised name. Already-present games appear greyed out and pre-unchecked,
   labelled "already in your library".

**Zero playtime is not a bug, state it in the UI.** Gamut cannot know how long
you played something before it was installed here, and §2.1 forbids inventing a
number — importing Steam's playtime would put the number Gamut exists to
correct into the field Gamut promises is honest. The prompt should say the games
start at zero.

**Non-Steam launchers are a separate, unverified question.** Epic, GOG Galaxy
and Xbox each keep their own install registry, and **none of it has been
measured on this machine.** §5.3 is the cautionary tale: the obvious source
(`.exe` ProductName) was wrong a third of the time and only measurement showed
it. So: **ship Steam-only first**, then measure the others before promising
them. Do not write speculative parsers for launcher formats you have not opened
on this PC.

### 9.5 Simple / Advanced detail toggle

One setting governing both the Stats table and the More Info window. **Simple is
the default** so a first-time user gets the clean version without discovering
anything.

Segmented `Simple | Advanced` control in **Settings → Appearance**, beside Data
table size. New setting `detailLevel: 'simple' | 'advanced'` with zod
`.catch('simple')`.

**Stats table**
- Simple: Game · Time Played · Status · Time to Beat · Rating
- Advanced adds: Started · Completed On · Genres

**More Info window**
- Simple: Played · Sessions · Average session · Time to Beat
- Advanced adds: Longest session · First played · Last played · Launches ·
  Game was open · **Tracked % · idle %**

**Note on the percentage:** show tracked and idle on **one line**
(`Tracked 89% · idle 11%`). They always sum to 100, so two separate rows add a
line without adding information.

### 9.6 Sidebar / filter clarity

The current sidebar stacks three unlabelled dropdowns reading "Name (A-Z)",
"All", "All". The user knows what they do; a newcomer sees three mystery boxes,
two saying the same word. Either label them, or collapse the two filters behind
a single "Filter" control that expands only when used. Recommend labelling —
cheaper and less magic.

**Interaction with §9.3:** sorting now belongs to Library, where the collection
actually lives. Decide deliberately whether the Timer tab's compact list keeps
its own sort control or simply follows Library's — it should follow, since one
`sortMode` setting driving two views is one concept instead of two, and the
Timer list is for switching between a handful of games, not browsing.

### 9.7 Remaining smaller items
- Nothing else is outstanding from the user's earlier requests. Everything else
  previously asked for is built (§4).

### 9.8 Definition of done
- `npm test && npm run typecheck && npm run build` all clean.
- New strings in **all 10 locales**.
- Verified through the real app with the §7 isolation method, including
  screenshots of Library grid, Library list, **a Library game detail view**,
  Timer, and Stats in both Simple and Advanced.
- **Auto-detect verified against the real Steam library on this PC** — the scan
  finds the installed games, importing creates them at zero playtime with art,
  and a second scan offers no duplicates.
- `npm run package:dev` built and launched so the user can try it.
- Committed to `dev` with the project's usual thorough commit messages.

---

## 10. Still untested by anyone

**Launch Game, auto-start-on-launch, and the background watcher have never been
exercised against a real game** starting and exiting. They cannot be verified
without actually launching a game on the user's machine, which is theirs to do.
Everything else in §4 is verified end to end.

---

## 11. Release process for v3

**Do §12 and §13 before this.** Both are explicitly part of what the user asked
for in this round ("patch exploitable stuffs after and optimize memory usage
after everything's done"), and both audit code that §9 is about to rewrite — so
they come after the UI work and before the release.

1. User tests and is satisfied.
2. Merge `dev` → `main`.
3. Bump to `3.0.0`, `npm run package`.
4. Commit, tag `v3.0.0`, push branch and tag.
5. `gh release create` with **user-facing** notes (what it means for them, not
   what changed in the code), then `gh release upload` the installer, the
   `.blockmap` **and** `latest.yml` — without `latest.yml` the in-app updater
   404s and silently fails.
6. Verify with `gh release view v3.0.0 --json ...` that it is not a draft and all
   three assets are attached.

**Release notes must state that session stats, launch counts and open time start
from zero on upgrade** — there is no history in existing save files. Say it
rather than let people wonder.

---

## 12. Security pass — scoped, after §9

Requested by the user: *"Can you also patch exploitable stuffs after."* This is
a **second** pass; the first shipped as v2.1.13 (§4.6). Do not redo that work.

### 12.1 Already audited — sound, do not re-derive

Checked 2026-08-08 against the code on `dev`. Each of these was examined and is
correct **for a specific reason**; the reason is recorded so a later reader can
tell "audited and fine" from "never looked at".

| Surface | Why it is sound |
|---|---|
| Art download → disk (`art/enrich.ts` `store()`) | Filename is `${randomUUID()}.jpg` — **fixed extension, no attacker-controlled path component**. This is precisely the bug class v2.1.13 fixed in `.gtprofile`, and this path never had it. |
| Art download → content | `downloadUsable()` rejects a buffer that `nativeImage.createFromBuffer` cannot decode, *before* anything is written. Non-image content cannot reach disk. |
| `setArtFromUrl` (renderer-supplied URL) | `isAllowedArtUrl(url)` gates the host before `net.fetch`, so a compromised renderer cannot use main as a request-forgery primitive. |
| `gt-asset://remote/<url>` proxy (`protocol.ts:29-41`) | Requires `https:` **and** an `ALLOWED_ART_HOSTS` hit; anything else is a 403. |
| `steam://rungameid/<id>` | The id is a zod-validated number, so nothing can be appended to the URI. |
| `contextIsolation` / `nodeIntegration` | `true` / `false`. Correct. |
| PowerShell and `reg.exe` invocations | Fixed argument arrays, no shell string interpolation. |

### 12.2 Genuinely worth changing

1. **`protocol.ts:45` uses a `..` denylist where the codebase now has a
   positive check.** `fileName.includes('..')` does block traversal here —
   Node's `join()` does not resolve an absolute second argument, so
   `C:/Windows/win.ini` cannot escape either — but v2.1.13 introduced
   `isInside()` in `util/safePath.ts` exactly so that this reasoning does not
   have to be re-done per call site. **Not a live vulnerability; a consistency
   fix.** Switch it to `isInside()` and add the case to the test suite. Record
   it honestly in the commit message as hardening, not as a patched exploit.
2. **Audit the v3 IPC surface for zod validation on every input.** The v3
   channels (`detect.ipc.ts`, the art channels) were written after the v2.1.13
   audit and were not part of it. Every channel that takes a renderer-supplied
   string and turns it into a path, a URL or a process argument needs its input
   validated in **main**, not merely in the renderer that calls it.
3. **§9.4 introduces a new untrusted-ish input: `.acf` files on disk.** Game
   names parsed out of `appmanifest_*.acf` become profile names, and profile
   names index into save data. Before shipping the importer, confirm a name
   containing path separators, `..`, or absurd length cannot reach a filesystem
   path. (Icons are stored under generated UUID names, which is most of the
   defence already — verify rather than assume it covers every new path.)
4. **Re-check `setWindowOpenHandler`** still restricts to http/https after any
   new external link is added by the redesign (About tab, art sources).

### 12.3 Residual, by design — not a bug, do not "fix" silently

The Launch button runs whatever `exePath` is in the save file. Anyone who can
write to AppData can already run code as the user, so this is not privilege
escalation — but it does make the save file security-relevant, and `exePath` is
therefore deliberately **not** exported in `.gtprofile` so a shared profile
cannot aim Launch at someone else's binary. Keep that exclusion.

### 12.4 Definition of done
- Changes are hardening with tests, described accurately.
- **If nothing exploitable is found, say so plainly.** A pass that reports "no
  new vulnerabilities, two consistency fixes" is a successful pass. Do not
  inflate a denylist-to-allowlist change into a patched exploit.

### 12.5 OUTCOME 2026-08-08 — no vulnerabilities found; three hardening changes

Stated plainly, per §12.4: **nothing exploitable was found.** The v3 IPC surface
was audited against the checklist in §12.2 and holds up.

**Changed:**
1. `protocol.ts` now uses `isInside()` instead of a `..` denylist (done as part
   of the Library work, since the covers route was being added to the same
   branch). Both stop traversal; one answer used everywhere beats each call site
   re-deriving that `join()` does not resolve an absolute second argument.
2. `fetchArt()` now holds the community-icon URL to the same `isAllowedArtUrl`
   allowlist as every other download. It arrives in Steam's own JSON rather than
   from the renderer, so this closes the one outbound fetch in the app that was
   fed by a remote field without a check. Measured: the endpoint returns
   `shared.fastly.steamstatic.com`, already on the list, so nothing broke.
3. `safeFileNameFromTitle()` sanitises the export dialog's *suggested* filename.
   A profile name is deliberately free-form, and since §9.4 those names can come
   from Steam's appmanifest files rather than only from typing; a name carrying
   separators would have pointed the save dialog at another folder. The user
   still confirms that dialog, so this is defence in depth, not a hole. Ten unit
   tests in `safePath.test.ts`.

**Confirmed sound, no change needed:**
- `searchSteamApps` and `findGogGame` both `encodeURIComponent` the query, so a
  crafted name cannot alter the URL.
- `setWindowOpenHandler` is still restricted to `http:`/`https:`.
- Profile names never reach a filesystem path anywhere else — stored art is
  written under `randomUUID()` filenames throughout.

**One correction worth recording so it is not re-investigated:** the regex in
`safeFileNameFromTitle` reads as though it strips spaces and hyphens when viewed
in a tool that renders control characters oddly. It does not — the class is
`[<>:"|?* -]`, i.e. the forbidden characters plus the control range,
and the `eslint-disable no-control-regex` above it is there for exactly that
reason. The unit tests assert spaces, hyphens and ampersands survive.

---

## 13. Memory pass — last, after §9 and §12

Requested by the user: *"optimize memory usage after everythings done too."*
Last on purpose — optimising code that §9 is about to replace is wasted work.

### 13.1 Already done — do not redo
- **v2.1.5**: icons capped at 256px, backgrounds at 2560px on *every* import
  path (`util/imageResize.ts`), after Task Manager showed ~700MB and a stored
  icon turned out to be 512×512 despite never rendering above 72px.
- **v2.1.6**: i18n lazy-loads locales (only `en` is eager); `GameList`'s rows are
  a `memo()`'d `GameRow` subscribing to its own `running[name]` slice, so a
  500ms tick no longer re-renders the whole list.
- **v3**: bounded `sessionLog` (200) + aggregates — §5.7, measured: save file
  3.29 MB → **0.68 MB**, main process 131 MB → **109 MB** at 40 games.

### 13.2 The one new risk the redesign introduces

**The Library grid (§9.1) renders art for every game at once — that is a new
memory profile the app has never had.** Today no view shows more than one
background at a time. Note what the existing fields actually are:

- `iconFile` — capped **256px**. Fine to render 40 of.
- `bgImage` — capped **2560px**. **Rendering 40 of these in a grid is the
  failure mode to avoid.** A decoded 2560×1440 RGBA surface is ~14MB; forty is
  ~560MB, which is the v2.1.5 bug returning in a new place.

So the grid must **not** source its tiles from `bgImage`. Options, in order of
preference:

1. Store a **third, separately capped image** — a portrait cover (~342×480),
   which is what `library_600x900` is for anyway (§5.1). Costs a new schema
   field and a new cap constant; gives the grid a proper Steam-like tile.
2. Render `iconFile` in the tile. Free, but 256px in a portrait tile will look
   soft.

**Measure before and after, do not reason about it.** The numbers in §5.7 were
obtained by measurement and twice contradicted the intuition that produced the
design (§6.2).

### 13.2.1 MEASURED 2026-08-08 — the cap was necessary, and the estimate was low

Option 1 was taken: `coverFile`, its own directory, and
`COVER_MAX_DIMENSION = 480`. `scripts/measure-library-memory.cjs` runs the real
app twice over identical 40-game libraries, changing only the pixel size of the
cover files, and reads Electron's own `app.getAppMetrics()`:

| | 480px covers (shipped) | 2560px covers (what reusing `bgImage` would have cost) |
|---|---|---|
| Cover files on disk | 13.5 MB | 76.3 MB |
| Renderer (`Tab`) | **127 MB** | 412 MB |
| GPU | 160 MB | 555 MB |
| Browser | 142 MB | 210 MB |
| Utility | 49 MB | 50 MB |
| **Total** | **479 MB** | **1227 MB** |

**+748 MB total, +285 MB in the renderer alone.** The §13.2 estimate of ~560 MB
was *under* the real figure, because it only counted decoded bitmaps in the
renderer and missed that GPU texture memory grows with them too — GPU is the
single largest line in the uncapped run.

**Consequences, already applied:**
- `GameArt` resolves `coverFile → iconFile → lettered placeholder` and
  deliberately never falls back to `bgImage`. That is a memory constraint
  wearing a visual disguise; do not "improve" the fallback chain by adding the
  background to it.
- **Virtualising the grid is NOT needed** at this scale and was not done. 127 MB
  of renderer for 40 games sits beside the 109 MB main process measured in §5.7
  — the cap did the work, and a virtualised list would have added real
  complexity for no measured gain. Revisit only if someone turns up with a
  library large enough to move that number, and measure again first.

### 13.3 Other candidates — resolved
1. ~~Virtualise the grid~~ — **not needed, see §13.2.1.** Measured, not assumed.
2. **Release art for games scrolled out of view** — not pursued. Tiles use
   `loading="lazy"` and Chromium manages the decoded-image cache itself; with
   the renderer at 127 MB there is nothing here worth hand-managing.
3. **`scanSteamLibrary()`'s cache** — resolved by giving it a `force` flag.
   The 60-second cache still serves the Add Game picker resolving several
   candidates in a row, but the installed-games scan bypasses it: there the
   cache is actively wrong, since someone who installs a game and immediately
   asks Gamut to find it would be told it isn't there.

### 13.4 Definition of done — MET
- Before/after numbers recorded in §13.2.1, reproducible via
  `node scripts/measure-library-memory.cjs [gameCount]`.
- `npm test`, `npm run typecheck`, `npm run build` all clean.
