# 🎮 Gamut

A lightweight, offline, manual play/pause time tracker for your games — track time spent playing each one, tag genres, mark completions, and watch your stats grow.

## Download

**[⬇ Download the latest installer from Releases](../../releases/latest)**

Run the installer, click through, done — no admin rights needed. Installs to your user folder and adds a Start Menu / optional Desktop shortcut. The app checks for updates on launch and can update itself in place.

## Features

- Manual play/pause game timer per profile, with autosave every few seconds and concurrent timers (switching games doesn't pause the one you left)
- A personal games list: add games, sort by name/last played/rating/genre, filter by genre
- Four-state tracking — Playing, Completed, Dropped, On Hold — each with its own snapshot of time and date
- Genre tags (multi-select), star ratings, notes, and manual Add/Remove Time for time tracked elsewhere
- Duplicate, export (`.gtprofile`), and import individual game profiles
- Custom box-art icon and background image per game
- Five color themes (Midnight Blue, Paper White, Slate Grey, Rose, Retro Terminal) plus full custom colors and font choice
- 10 languages, switchable anytime, no restart needed
- Optional system tray icon (green = tracking, red = paused), launch-at-startup, daily rolling backups of your tracked time
- Everything is stored locally — no account, no internet required except to check for app updates

## Editions

- **`v2` branch (this one)** — the current, actively developed Electron edition. Modern UI, auto-updates, all the features above.
- **`main` branch** — the original lightweight Python/Tkinter edition (v1.9.1), frozen but still available for anyone who'd rather not have the Electron/Chromium footprint.

## Building from source (v2)

```bash
npm install
npm run dev       # run in development
npm run typecheck
npm run package    # build a Windows installer into release/
```

## License

MIT — see [LICENSE](LICENSE).
