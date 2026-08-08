# Gamut v3 — punch list

The user's list from 2026-08-08, after testing the multi-launcher build. Work it
**in order, one item at a time**. Nothing outside this list gets done until it
is finished; new findings are appended, not inserted ahead. Linux support is
last and deliberately so — it is the cherry, not a prerequisite.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done

---

## A. Art fetching

- [x] **A1. SteamGridDB as the art source for non-Steam games.**
  Settings → Launchers gets `SteamGridDB API key: [__________]` with a note
  directly beneath: *"for non-Steam icon/background fetch from SteamGridDB"*.
  Used for Nexon / Epic / Xbox / EA / Battle.net games.
  Note: this is a deliberate, user-supplied exception to the "no API key" rule
  in roadmap §2.2 — the key is the *user's own*, entered by them, not shipped.

## B. Launching (all measured broken on real games)

- [~] **B1. Vindictus** — shows "Loading Nexon Launcher…" then nothing happens.
- [x] **B2. Xbox games have no Launch Game button at all** (no `.exe`, so the
  button's `canLaunch` test fails — it must accept `launchUri` too).
- [~] **B3. Heroes of the Storm** — Battle.net opens and navigates to the game's
  page, but never starts it. Same from another game's page.
- [x] **B4. Rocket League timer** — starts after the first EasyAntiCheat splash,
  then a second EAC process opens and the timer PAUSES and never resumes.
- [x] **B5. Closing a game does not stop the timer** (possibly all games, or
  only launcher-fronted ones — needs checking).

## C. Structure

- [x] **C1. Remove the Timer tab entirely.** It is redundant: Library already
  holds everything, and clicking a game shows its timer.
  (Supersedes the earlier "add sort/filter to Timer" and "add a search bar to
  Timer" requests — both are void once the tab is gone.)
- [x] **C2. Search bar in Library.**
- [x] **C3. Sort by platform in Library** — Steam → Xbox → Epic → EA → GOG → …

## D. Game actions

- [x] **D1. Add "Reset time"** to Modify → Time, under the time.
- [x] **D2. Remove "Note (optional)"** from Modify → Time.
- [x] **D3. Remove "Duplicate"** everywhere.
- [x] **D4. Add "Import"** to a focused game in Library (Export exists, Import
  does not).
- [ ] **D5. Notes become a multi-note list** — a `+` button, renameable notes, a
  list view showing note names, click to open, back arrow to return. Outlook /
  Google Keep shaped. One game can have many notes.

## E. Library presentation

- [x] **E1. "Profile Icon Size" → "Icon Size"**, and make it control the
  Library **list** mode's icons.
- [x] **E2. List mode must show the ICON, not the background image.**
- [x] **E3. Add Game dialog needs the Scan button.**
- [x] **E4. Right-click menu at the bottom of the Library runs off-screen** —
  options below the window edge are unreachable, so a game can't be deleted.

## F. Stats

- [x] **F1. Exclude `not_started` games from Stats.**
- [x] **F2. Detail level becomes a button inside the Stats window.** It shows
  the level you would switch TO: labelled "Advanced" while Simple is active,
  "Simple" while Advanced is active. Remove the setting from Settings → Games.

## G. Settings

- [x] **G1. Tab order: General → Launchers → Games → Appearance → Language.**
- [x] **G2. Font picker becomes a dropdown** (keep the search box inside it).
- [x] **G3. "Data table size" → "Stats table size".**
- [x] **G4. Font size range 0.7x – 1.5x.**
- [x] **G5. "Watch for games in the background" is meaningless to a reader** —
  clarify the label, or explain what it does, or both.

## H. About

- [x] **H1. Credit the sources used for icon/background fetching.**

## Z. Last

- [ ] **Z1. Linux build.** Only once every box above is ticked.
