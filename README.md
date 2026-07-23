# 🎮 GameTimer

A lightweight, offline, manual play/pause time tracker for your games — track time spent playing each one, tag genres, mark completions, and watch your stats grow.

## Download (no install needed, just the app)

**[⬇ Download GameTimerSetup.exe from the latest Release](../../releases/latest)**

Run the installer, click through, done — no Python, no dependencies, nothing else to install. It installs to your user folder (no admin rights needed) and adds a Start Menu / optional Desktop shortcut.

## Features

- Manual play/pause game timer per profile, with autosave every few seconds
- A personal games list: add games, sort by name/last played/genre, filter by genre
- Genre tags (multi-select) and per-game completion tracking with completion date
- Custom box-art icon and background image per game
- Five color themes (Midnight Blue, Paper White, Slate Grey, Rose, Retro Terminal) plus full custom colors and font choice
- Optional system tray icon (green = tracking, red = paused), launch-at-startup, export/import individual game profiles
- Daily rolling backups of your tracked time, kept for two weeks
- Everything is stored locally in a plain JSON file next to the app — no account, no internet required

## Building from source

The full source is just one file, [`game_timer.py`](game_timer.py). To run it directly:

```bash
pip install pillow pystray
python game_timer.py
```

`pillow` and `pystray` are optional — the app runs without them, just without custom icons/backgrounds and the tray icon.

To build your own installer, see [`installer.iss`](installer.iss) (requires [Inno Setup](https://jrsoftware.org/isinfo.php)) after building the exe with PyInstaller:

```bash
pyinstaller --noconfirm --onefile --windowed --name GameTimer --icon icon.ico --add-data "icon.ico;." game_timer.py
```

## License

MIT — see [LICENSE](LICENSE).
