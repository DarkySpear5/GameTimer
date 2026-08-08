# Gamut v3 — Roadmap & Full Context Handoff

> **Read this first, completely, before touching anything.** It is written for a
> session with no memory of the work that produced it. Everything needed is
> here: current state, what is already built, decisions and the reasons behind
> them (including two that were reversed by measurement), verified external
> facts, testing method, traps, and the remaining work.
>
> Written 2026-08-08 at the end of a long session, at the user's request, so the
> conversation could be cleared and resumed from this file.

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
settled here. Do ask about the items explicitly marked **OPEN** in §9.

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

---

## 9. THE WORK — information-architecture redesign

**Goal, in the user's words:** the software should be understandable "with a new
eye", less cluttered for a first-time user. Everything below serves that.

The user has approved this direction and asked to be shown the result rather
than consulted per step. Build it, verify it, present it.

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
  linked to an exe, art-picked, deleted. All management lives here.
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

**OPEN QUESTION for the user:** should clicking a game in Library switch to
Timer with it selected, or open a game *detail page* inside Library (Steam-like)
with the timer embedded? The first is less code and fewer concepts; the second
is closer to Steam. Recommend the **first** for simplicity, and ask.

### 9.2 Simple / Advanced detail toggle

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

### 9.3 Sidebar / filter clarity

The current sidebar stacks three unlabelled dropdowns reading "Name (A-Z)",
"All", "All". The user knows what they do; a newcomer sees three mystery boxes,
two saying the same word. Either label them, or collapse the two filters behind
a single "Filter" control that expands only when used. Recommend labelling —
cheaper and less magic.

### 9.4 Remaining smaller items
- Nothing else is outstanding from the user's earlier requests. All previously
  requested features are built (§4).

### 9.5 Definition of done
- `npm test && npm run typecheck && npm run build` all clean.
- New strings in **all 10 locales**.
- Verified through the real app with the §7 isolation method, including
  screenshots of Library grid, Library list, Timer, and Stats in both Simple and
  Advanced.
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
