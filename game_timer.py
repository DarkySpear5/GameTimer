"""
Game Timer
A lightweight, offline, manual play/pause time tracker with per-game profiles.

Data (profiles, settings) is saved to game_timer_data.json next to the program.
Custom profile images go in "icons/", custom backgrounds go in "backgrounds/",
both next to the program. Progress survives closing the app or rebooting your
PC, and auto-saves every few seconds while a timer is running.

Optional features (require extra packages, see HOW_TO_BUILD_EXE.md):
  - Custom box-art icon & background per profile -> needs Pillow
  - System tray icon with live status dot         -> needs Pillow + pystray
  - Launch at Windows startup                     -> stdlib (winreg), exe only

Controls:
  - Select a profile on the left, then hit Play/Pause.
  - "+ Add Game" to add a game.
  - Right-click a profile for Rename / Change Icon / Change Background /
    Export / Import / Delete. Right-click empty space for Add Game / Import.
  - Gear icon (top-right) opens Settings, organized into tabs.
"""

import tkinter as tk
from tkinter import simpledialog, messagebox, filedialog, colorchooser, ttk
import json
import os
import sys
import time
import base64
import uuid
import shutil
import threading
import webbrowser

from translations import (
    GENRE_OPTIONS, LANGUAGE_NAMES, LANGUAGE_ORDER, apply_language_global, tr, tr_genre,
)

try:
    from PIL import Image, ImageDraw, ImageTk, ImageOps
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    import pystray
    TRAY_AVAILABLE = PIL_AVAILABLE
except ImportError:
    TRAY_AVAILABLE = False

try:
    import winreg
    WINREG_AVAILABLE = True
except ImportError:
    WINREG_AVAILABLE = False

# ---------- Paths ----------
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_FILE = os.path.join(BASE_DIR, "game_timer_data.json")
ICONS_DIR = os.path.join(BASE_DIR, "icons")
BACKGROUNDS_DIR = os.path.join(BASE_DIR, "backgrounds")
PROFILES_DIR = os.path.join(BASE_DIR, "profiles")
LOG_FILE = os.path.join(BASE_DIR, "game_timer_log.txt")
BACKUPS_DIR = os.path.join(BASE_DIR, "backups")
BACKUP_RETENTION_DAYS = 14


def get_app_icon_path():
    """Where to find icon.ico for the window/taskbar icon. The --icon flag
    passed to PyInstaller only sets the icon Explorer shows for the .exe file
    itself — it does NOT set the running window's title-bar/taskbar icon,
    which Tkinter defaults to its own icon unless told otherwise. Bundling
    icon.ico as a data file (see HOW_TO_BUILD_EXE.md) makes it available here
    at runtime via PyInstaller's extraction folder."""
    candidates = []
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.append(os.path.join(meipass, "icon.ico"))
    candidates.append(os.path.join(BASE_DIR, "icon.ico"))
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

STARTUP_REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
STARTUP_APP_NAME = "GameTimer"
GITHUB_URL = "https://github.com/DarkySpear5/GameTimer"

# ---------- Theme presets ----------
# Each preset defines the whole palette. GREEN/RED/GOLD stay constant across
# themes since they're functional (play/pause/complete), not decorative.
THEMES = {
    "Midnight Blue": {"bg": "#1e1e2e", "panel": "#181825", "card": "#26263a",
                       "text": "#cdd6f4", "subtext": "#9399b2", "accent": "#89b4fa"},
    "Paper White":   {"bg": "#f5f5f7", "panel": "#e8e8ec", "card": "#ffffff",
                       "text": "#1e1e2e", "subtext": "#5c5c66", "accent": "#3b6fd6"},
    "Slate Grey":    {"bg": "#232326", "panel": "#1c1c1f", "card": "#2e2e33",
                       "text": "#e4e4e7", "subtext": "#9a9aa2", "accent": "#a0a0ad"},
    "Rose":          {"bg": "#2b1e26", "panel": "#241a20", "card": "#3a2530",
                       "text": "#f6e0e8", "subtext": "#c9a3b2", "accent": "#f5a6c9"},
    "Retro Terminal": {"bg": "#0a0f0a", "panel": "#050805", "card": "#0f180f",
                       "text": "#33ff66", "subtext": "#1f9e42", "accent": "#33ff66"},
}
THEME_ORDER = ["Midnight Blue", "Paper White", "Slate Grey", "Rose", "Retro Terminal", "Custom"]
DEFAULT_CUSTOM_COLORS = dict(THEMES["Midnight Blue"])

FONT_CHOICES = ["Segoe UI", "Verdana", "Arial", "Calibri", "Trebuchet MS", "Georgia", "Comic Sans MS"]

# ---------- Theme (mutable — see apply_theme_globals / apply_font_globals) ----------
BG = "#1e1e2e"
PANEL = "#181825"
CARD = "#26263a"
TEXT = "#cdd6f4"
SUBTEXT = "#9399b2"
ACCENT_DEFAULT = "#89b4fa"
GREEN = "#a6e3a1"
RED = "#f38ba8"
GOLD = "#f9e2af"
GREEN_RGBA = (166, 227, 161, 255)
RED_RGBA = (243, 139, 168, 255)
FONT_FAMILY_UI = "Segoe UI"
FONT_MAIN = ("Segoe UI", 11)
FONT_SMALL = ("Segoe UI", 9)
FONT_TITLE_BASE = 15
FONT_TIMER_BASE = 42

ICON_SIZE_OPTIONS = {"Small": 24, "Medium": 36, "Large": 52, "Extra Large": 72}


def apply_theme_globals(theme_dict):
    """Mutate the module-level color constants. Every widget-creation call in
    this file references these names directly, and Python looks up globals at
    call time — so calling this before building the UI re-themes everything
    without needing to touch each widget individually."""
    global BG, PANEL, CARD, TEXT, SUBTEXT, ACCENT_DEFAULT
    BG = theme_dict.get("bg", BG)
    PANEL = theme_dict.get("panel", PANEL)
    CARD = theme_dict.get("card", CARD)
    TEXT = theme_dict.get("text", TEXT)
    SUBTEXT = theme_dict.get("subtext", SUBTEXT)
    ACCENT_DEFAULT = theme_dict.get("accent", ACCENT_DEFAULT)


def apply_font_globals(family):
    global FONT_FAMILY_UI, FONT_MAIN, FONT_SMALL
    FONT_FAMILY_UI = family
    FONT_MAIN = (family, 11)
    FONT_SMALL = (family, 9)


# ---------- Data helpers ----------
def load_data():
    data = {}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    data.setdefault("profiles", {})
    data.setdefault("last_selected", None)
    data.setdefault("settings", {})
    data["settings"].setdefault("tray_enabled", True)
    data["settings"].setdefault("run_at_startup", False)
    data["settings"].setdefault("accent", ACCENT_DEFAULT)
    data["settings"].setdefault("icon_size", 36)
    data["settings"].setdefault("theme", "Midnight Blue")
    data["settings"].setdefault("custom_colors", dict(DEFAULT_CUSTOM_COLORS))
    data["settings"].setdefault("font_family", "Segoe UI")
    data["settings"].setdefault("sort_mode", "name")
    data["settings"].setdefault("genre_filter", "All")
    data["settings"].setdefault("language", "en")
    for p in data["profiles"].values():
        p.setdefault("icon_file", None)
        p.setdefault("bg_color", None)
        p.setdefault("bg_image", None)
        p.setdefault("last_played", None)
        p.setdefault("notes", "")
        p.setdefault("rating", 0)
        if "status" not in p:
            # Migrate from the old completed/completed_at/completed_seconds
            # boolean triplet (pre-v1.6) into the unified status field.
            if p.get("completed"):
                p["status"] = "completed"
                p["status_at"] = p.get("completed_at")
                p["status_seconds"] = p.get("completed_seconds")
            else:
                p["status"] = "in_progress"
                p["status_at"] = None
                p["status_seconds"] = None
        p.setdefault("status_at", None)
        p.setdefault("status_seconds", None)
        if "genres" not in p:
            old_genre = p.pop("genre", None)
            p["genres"] = [old_genre] if old_genre else ["Uncategorized"]
        if not p["genres"]:
            p["genres"] = ["Uncategorized"]
    return data


def save_data(data):
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, DATA_FILE)


def write_log_file(data):
    """Overwrite a human-readable snapshot log — readable without opening the app."""
    try:
        total_seconds = sum(p.get("seconds", 0) for p in data["profiles"].values())
        completed = [n for n, p in data["profiles"].items() if p.get("status") == "completed"]
        lines = []
        lines.append("GAME TIMER — LOG")
        lines.append(f"Last updated: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("")
        lines.append("SUMMARY")
        lines.append(f"  Total time played : {format_seconds(total_seconds)}")
        lines.append(f"  Games tracked     : {len(data['profiles'])}")
        lines.append(f"  Games completed   : {len(completed)}")
        lines.append("")
        lines.append("GAMES")
        name_width = max([len(n) for n in data["profiles"]] + [10]) + 2
        status_labels = {"completed": "Completed", "dropped": "Dropped", "on_hold": "On Hold"}
        for name, info in data["profiles"].items():
            status = status_labels.get(info.get("status"), "In Progress")
            if info.get("status_at"):
                status_seconds = info.get("status_seconds")
                stamp = f", at {format_seconds(status_seconds)}" if status_seconds is not None else ""
                completed_on = f" ({info['status_at']}{stamp})"
            else:
                completed_on = ""
            genre = ", ".join(info.get("genres", ["Uncategorized"]))
            lines.append(
                f"  {name.ljust(name_width)} {format_seconds(info.get('seconds', 0)).rjust(14)}  "
                f"{status}{completed_on}  [{genre}]"
            )
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception:
        pass  # logging must never crash the app


def backup_data_file():
    """Keep one daily snapshot of game_timer_data.json for the last couple
    weeks. The atomic save (tmp + os.replace) protects against corruption
    from a crash mid-write, but not against a user mistake — a wrong click
    on "Reset Time" or a bad Import can wipe hours of tracked time with no
    way back. A cheap rolling backup gives that a way back."""
    try:
        if not os.path.exists(DATA_FILE):
            return
        os.makedirs(BACKUPS_DIR, exist_ok=True)
        today = time.strftime("%Y-%m-%d")
        dest = os.path.join(BACKUPS_DIR, f"game_timer_data_{today}.json")
        if not os.path.exists(dest):
            shutil.copy2(DATA_FILE, dest)
        cutoff = time.time() - BACKUP_RETENTION_DAYS * 86400
        for fname in os.listdir(BACKUPS_DIR):
            fpath = os.path.join(BACKUPS_DIR, fname)
            try:
                if os.path.getmtime(fpath) < cutoff:
                    os.remove(fpath)
            except OSError:
                pass
    except Exception:
        pass  # backups are best-effort, must never block normal saving


def format_seconds(total):
    total = int(total)
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    if days:
        return f"{days}d {hours:02}:{minutes:02}:{seconds:02}"
    return f"{hours:02}:{minutes:02}:{seconds:02}"


def set_startup(enabled):
    if not WINREG_AVAILABLE:
        return
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, STARTUP_REG_PATH, 0, winreg.KEY_SET_VALUE)
    try:
        if enabled:
            exe_path = sys.executable
            winreg.SetValueEx(key, STARTUP_APP_NAME, 0, winreg.REG_SZ, f'"{exe_path}"')
        else:
            try:
                winreg.DeleteValue(key, STARTUP_APP_NAME)
            except FileNotFoundError:
                pass
    finally:
        winreg.CloseKey(key)


def make_tray_image(color_rgba):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((6, 6, 58, 58), fill=color_rgba, outline=(30, 30, 46, 255), width=3)
    return img


# ---------- Single instance guard (Windows) ----------
_single_instance_mutex = None


def acquire_single_instance():
    """Returns False if another copy of the app is already running."""
    global _single_instance_mutex
    if sys.platform != "win32":
        return True
    try:
        import ctypes
        ERROR_ALREADY_EXISTS = 183
        mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "Global\\GameTimerSingleInstanceMutex")
        if ctypes.windll.kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
            return False
        _single_instance_mutex = mutex
        return True
    except Exception:
        return True  # fail open rather than block a legitimate launch


class GameTimerApp:
    def __init__(self, root):
        self.root = root
        self.data = load_data()

        theme_name = self.data["settings"].get("theme", "Midnight Blue")
        if theme_name == "Custom":
            apply_theme_globals(self.data["settings"].get("custom_colors", DEFAULT_CUSTOM_COLORS))
        else:
            apply_theme_globals(THEMES.get(theme_name, THEMES["Midnight Blue"]))
        apply_font_globals(self.data["settings"].get("font_family", "Segoe UI"))
        apply_language_global(self.data["settings"].get("language", "en"))

        self.accent = self.data["settings"].get("accent", ACCENT_DEFAULT)
        self.icon_size = self.data["settings"].get("icon_size", 36)
        self.sort_mode = self.data["settings"].get("sort_mode", "name")
        self.genre_filter = self.data["settings"].get("genre_filter", "All")

        # profile_name -> tick_start (time.time() when it was pressed play).
        # Any number of profiles can be in here at once — timers run
        # concurrently and are independent of which profile is selected.
        self.active_timers = {}
        self.selected = None
        self.last_autosave = time.time()
        self.autosave_interval = 5
        self.last_log_write = time.time()
        self.log_interval = 60
        self.last_backup_day = None
        self.thumb_refs = {}
        self.data_thumb_refs = {}
        self.tray_icon = None
        self.bg_photo = None
        self.bg_image_id = None
        self._bg_source_path = None
        self._bg_source_image = None
        self.timer_panel_photo = None
        self.timer_panel_id = None

        root.title("Game Timer")
        root.geometry("820x520")
        root.minsize(760, 460)
        root.configure(bg=BG)
        icon_path = get_app_icon_path()
        if icon_path:
            try:
                root.iconbitmap(icon_path)
            except Exception:
                pass

        self._build_ui()
        self._refresh_profile_list()

        last = self.data.get("last_selected")
        if last and last in self.data["profiles"]:
            self._select_profile(last)
        elif self.data["profiles"]:
            self._select_profile(next(iter(self.data["profiles"])))
        else:
            self._update_complete_toggle_visual()
            self._render_background()

        write_log_file(self.data)

        root.protocol("WM_DELETE_WINDOW", self._on_close)

        self._apply_tray_setting()
        if getattr(sys, "frozen", False) and WINREG_AVAILABLE:
            try:
                set_startup(self.data["settings"].get("run_at_startup", False))
            except Exception:
                pass

        self._tick()

    # ---------- UI construction ----------
    def _build_ui(self):
        topbar = tk.Frame(self.root, bg=PANEL, height=44)
        topbar.pack(side="top", fill="x")
        tk.Label(topbar, text="Game Timer", bg=PANEL, fg=TEXT,
                 font=(FONT_FAMILY_UI, 15, "bold")).pack(side="left", padx=14, pady=6)
        gear_btn = tk.Button(topbar, text="\u2699", command=self._open_settings, bg=PANEL, fg=TEXT,
                             activebackground=PANEL, activeforeground=TEXT, bd=0,
                             highlightthickness=0, font=(FONT_FAMILY_UI, 14), cursor="hand2")
        gear_btn.pack(side="right", padx=12)
        self._add_hover(gear_btn, PANEL)

        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("Treeview", background=PANEL, fieldbackground=PANEL, foreground=TEXT,
                        rowheight=self.icon_size + 14, font=FONT_MAIN, borderwidth=0,
                        relief="flat", bordercolor=PANEL, lightcolor=PANEL, darkcolor=PANEL)
        style.map("Treeview", background=[("selected", self.accent)],
                  foreground=[("selected", "#1e1e2e")])
        # The 'clam' theme draws a light border frame around Treeview by default,
        # which shows up as an ugly bright line against a dark theme. This strips it.
        style.layout("Treeview", [("Treeview.treearea", {"sticky": "nswe"})])
        style.configure("Treeview.Heading", background=CARD, foreground=TEXT,
                        font=FONT_MAIN, borderwidth=0, relief="flat",
                        bordercolor=CARD, lightcolor=CARD, darkcolor=CARD)
        style.map("Treeview.Heading", background=[("active", CARD)])
        style.configure("Vertical.TScrollbar", background=CARD, troughcolor=PANEL,
                        bordercolor=PANEL, lightcolor=CARD, darkcolor=CARD,
                        arrowcolor=TEXT, relief="flat", arrowsize=14, width=14)
        style.map("Vertical.TScrollbar",
                  background=[("active", self.accent), ("pressed", self.accent)],
                  arrowcolor=[("active", "#1e1e2e"), ("pressed", "#1e1e2e")])
        self._style_notebook(style)

        self.main_notebook = ttk.Notebook(self.root)
        self.main_notebook.pack(side="top", fill="both", expand=True)

        timer_tab = tk.Frame(self.main_notebook, bg=BG)
        data_tab = tk.Frame(self.main_notebook, bg=BG)
        about_tab = tk.Frame(self.main_notebook, bg=BG)
        self.main_notebook.add(timer_tab, text=tr("tab_game_timer"))
        self.main_notebook.add(data_tab, text=tr("tab_data"))
        self.main_notebook.add(about_tab, text=tr("tab_about"))
        self.main_notebook.bind("<<NotebookTabChanged>>", self._on_main_tab_changed)

        body = timer_tab

        # ----- Left panel: profile list -----
        left = tk.Frame(body, bg=PANEL, width=240)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        # Bottom-anchored widgets are packed FIRST with side="bottom" so they
        # always reserve their space, no matter how short the window gets.
        # The scrollable game list is packed last and simply fills whatever
        # vertical space remains — it never pushes the button off-screen.
        hint_label = tk.Label(left, text=tr("hint_right_click"),
                               bg=PANEL, fg=SUBTEXT, font=FONT_SMALL, wraplength=200)
        hint_label.pack(side="bottom", padx=12, pady=(0, 10))

        btn_frame = tk.Frame(left, bg=PANEL)
        btn_frame.pack(side="bottom", fill="x", padx=10, pady=10)
        self._make_button(btn_frame, tr("btn_add_game"), self._new_profile,
                           bg=self.accent, fg="#1e1e2e").pack(fill="x", pady=2)

        top_row = tk.Frame(left, bg=PANEL)
        top_row.pack(side="top", fill="x", padx=16, pady=(16, 4))
        tk.Label(top_row, text=tr("label_games"), bg=PANEL, fg=SUBTEXT,
                 font=FONT_SMALL).pack(side="left")

        sort_filter_row = tk.Frame(left, bg=PANEL)
        sort_filter_row.pack(side="top", fill="x", padx=10, pady=(0, 6))
        self._make_button(sort_filter_row, tr("btn_sort"), self._open_sort_menu, bg=CARD, fg=TEXT,
                           width=9, font=FONT_SMALL).pack(side="left", expand=True, fill="x", padx=(0, 3))
        self._make_button(sort_filter_row, tr("btn_filter"), self._open_filter_menu, bg=CARD, fg=TEXT,
                           width=9, font=FONT_SMALL).pack(side="left", expand=True, fill="x", padx=(3, 0))

        list_frame = tk.Frame(left, bg=PANEL)
        list_frame.pack(side="top", fill="both", expand=True, padx=10)

        scrollbar = ttk.Scrollbar(list_frame, orient="vertical")
        scrollbar.pack(side="right", fill="y")

        self.tree = ttk.Treeview(list_frame, show="tree", selectmode="browse",
                                  yscrollcommand=scrollbar.set)
        self.tree.column("#0", width=200)
        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.tree.yview)
        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)
        self.tree.bind("<Double-1>", lambda e: self._rename_profile())
        self.tree.bind("<Button-3>", self._show_context_menu)
        self.tree.bind("<Delete>", lambda e: self._delete_profile())

        # ----- Right panel: canvas-based timer display (supports per-profile background) -----
        right = tk.Frame(body, bg=BG)
        right.pack(side="left", fill="both", expand=True)

        self.canvas = tk.Canvas(right, bg=BG, highlightthickness=0, bd=0)
        self.canvas.pack(fill="both", expand=True)

        self.title_id = self.canvas.create_text(
            0, 0, text=tr("canvas_no_profile_selected"), fill=TEXT,
            font=(FONT_FAMILY_UI, FONT_TITLE_BASE, "bold"), anchor="center"
        )
        self.status_id = self.canvas.create_text(
            0, 0, text="", fill=SUBTEXT, font=FONT_SMALL, anchor="center"
        )
        self.rating_id = self.canvas.create_text(
            0, 0, text="", fill=GOLD, font=(FONT_FAMILY_UI, 16), anchor="center"
        )
        self.timer_id = self.canvas.create_text(
            0, 0, text="00:00:00", fill=TEXT,
            font=("Consolas", FONT_TIMER_BASE, "bold"), anchor="center"
        )

        self.play_button = tk.Button(
            self.canvas, text=tr("btn_play"), command=self._toggle_play, bg=GREEN, fg="#1e1e2e",
            activebackground=GREEN, activeforeground="#1e1e2e", bd=0, relief="flat",
            highlightthickness=0, font=(FONT_FAMILY_UI, 13, "bold"), width=12, padx=6, pady=8, cursor="hand2"
        )
        self._add_hover(self.play_button, GREEN)
        self.play_window_id = self.canvas.create_window(0, 0, window=self.play_button)

        # ----- Complete toggle: a phone-settings-style on/off switch -----
        # Label sits to the left of the switch at the same height (the usual
        # "Setting Name .......... [toggle]" row layout) rather than stacked
        # above it, so it can't end up visually lost near the switch.
        if PIL_AVAILABLE:
            self.complete_toggle_label_id = self.canvas.create_text(
                0, 0, text=tr("label_complete_toggle"), fill=TEXT,
                font=(FONT_FAMILY_UI, 12, "bold"), anchor="e"
            )
            self._toggle_photo = None
            self.complete_toggle_id = self.canvas.create_image(0, 0, anchor="center")
            for tag in ("<Button-1>",):
                self.canvas.tag_bind(self.complete_toggle_id, tag, lambda e: self._toggle_complete())
            self.canvas.tag_bind(self.complete_toggle_id, "<Enter>", lambda e: self.canvas.config(cursor="hand2"))
            self.canvas.tag_bind(self.complete_toggle_id, "<Leave>", lambda e: self.canvas.config(cursor="arrow"))
            self.complete_button = None
            self.reset_window_id = None
        else:
            self.complete_toggle_label_id = None
            self.complete_toggle_id = None
            self.complete_button = tk.Button(
                self.canvas, text=tr("btn_complete"), command=self._toggle_complete, bg=GOLD, fg="#1e1e2e",
                activebackground=GOLD, activeforeground="#1e1e2e", bd=0, relief="flat",
                highlightthickness=0, font=FONT_MAIN, width=11, padx=6, pady=8, cursor="hand2"
            )
            self._add_hover(self.complete_button, GOLD)
            self.reset_window_id = self.canvas.create_window(0, 0, window=self.complete_button)

        self.hint_id = self.canvas.create_text(
            0, 0, text=tr("hint_canvas"),
            fill=SUBTEXT, font=FONT_SMALL, anchor="center"
        )

        self.canvas.bind("<Configure>", self._reposition_canvas_items)

        # ----- Data tab -----
        self._build_data_tab(data_tab)

        # ----- About tab -----
        self._build_about_tab(about_tab)

    def _style_notebook(self, style):
        style.configure("TNotebook", background=BG, borderwidth=0, bordercolor=BG,
                        lightcolor=BG, darkcolor=BG)
        style.configure("TNotebook.Tab", background=PANEL, foreground=SUBTEXT,
                        padding=(16, 9), font=FONT_MAIN, borderwidth=0,
                        bordercolor=BG, lightcolor=PANEL, darkcolor=PANEL)
        style.map("TNotebook.Tab",
                  background=[("selected", CARD)],
                  foreground=[("selected", self.accent)])
        # 'clam' draws a dotted focus-ring element inside the selected tab by
        # default — against a dark theme this reads as a stray bright line.
        # Rebuilding the tab layout without the focus element removes it.
        style.layout("TNotebook.Tab", [
            ("TNotebook.tab", {"sticky": "nswe", "children": [
                ("TNotebook.padding", {"sticky": "nswe", "children": [
                    ("TNotebook.label", {"sticky": ""})
                ]})
            ]})
        ])
        # The notebook's client-area frame also gets a default border in 'clam';
        # flatten it so no line shows between the tab strip and its content.
        style.layout("TNotebook", [
            ("TNotebook.client", {"sticky": "nswe"})
        ])

    def _on_main_tab_changed(self, event=None):
        idx = self.main_notebook.index(self.main_notebook.select())
        if idx == 1:  # Data tab
            self._refresh_data_tab()

    def _build_data_tab(self, parent):
        tk.Label(parent, text=tr("stats_title"), bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 18, "bold")).pack(anchor="w", padx=24, pady=(22, 12))

        stats_row = tk.Frame(parent, bg=BG)
        stats_row.pack(fill="x", padx=24, pady=(0, 18))

        self.stat_total_time_label = self._make_stat_card(stats_row, tr("stat_total_time"), "00:00:00")
        self.stat_games_tracked_label = self._make_stat_card(stats_row, tr("stat_games_tracked"), "0")
        self.stat_completed_label = self._make_stat_card(stats_row, tr("stat_games_completed"), "0")

        table_frame = tk.Frame(parent, bg=BG)
        table_frame.pack(fill="both", expand=True, padx=24, pady=(0, 20))

        columns = ("time", "status", "completed_on", "completed_time", "rating", "genres")
        self.data_tree = ttk.Treeview(table_frame, columns=columns, show="tree headings",
                                       selectmode="browse")
        self.data_tree.heading("#0", text=tr("col_game"))
        self.data_tree.heading("time", text=tr("col_time_played"))
        self.data_tree.heading("status", text=tr("col_status"))
        self.data_tree.heading("completed_on", text=tr("col_status_date"))
        self.data_tree.heading("completed_time", text=tr("col_status_time"))
        self.data_tree.heading("rating", text=tr("col_rating"))
        self.data_tree.heading("genres", text=tr("col_genres"))
        self.data_tree.column("#0", width=190)
        self.data_tree.column("time", width=100, anchor="center")
        self.data_tree.column("status", width=90, anchor="center")
        self.data_tree.column("completed_on", width=95, anchor="center")
        self.data_tree.column("completed_time", width=100, anchor="center")
        self.data_tree.column("rating", width=90, anchor="center")
        self.data_tree.column("genres", width=140, anchor="center")

        vsb = ttk.Scrollbar(table_frame, orient="vertical", command=self.data_tree.yview)
        self.data_tree.configure(yscrollcommand=vsb.set)
        self.data_tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")

        self.data_tree.tag_configure("rowA", background=PANEL, foreground=TEXT)
        self.data_tree.tag_configure("rowB", background=CARD, foreground=TEXT)

    def _build_about_tab(self, parent):
        canvas = tk.Canvas(parent, bg=BG, highlightthickness=0)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
        inner = tk.Frame(canvas, bg=BG)
        inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=inner, anchor="nw", width=560)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self._bind_mousewheel(self.root, canvas)

        tk.Label(inner, text="Game Timer", bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 20, "bold")).pack(anchor="w", padx=24, pady=(24, 2))
        tk.Label(inner, text=f"v1.6 — {tr('about_tagline')}",
                 bg=BG, fg=SUBTEXT, font=FONT_MAIN).pack(anchor="w", padx=24, pady=(0, 20))

        tk.Label(inner, text=tr("about_built_with"), bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 13, "bold")).pack(anchor="w", padx=24, pady=(0, 8))

        third_party = [
            ("Python", tr("about_lib_python_desc"), tr("about_lic_psf")),
            ("Tkinter", tr("about_lib_tkinter_desc"), tr("about_lic_bundled")),
            ("Pillow (PIL)", tr("about_lib_pillow_desc"), tr("about_lic_hpnd")),
            ("pystray", tr("about_lib_pystray_desc"), tr("about_lic_lgpl")),
            ("PyInstaller", tr("about_lib_pyinstaller_desc"), tr("about_lic_gpl_bootloader")),
            ("Inno Setup", tr("about_lib_innosetup_desc"), tr("about_lic_free_commercial")),
        ]
        for lib_name, desc, license_note in third_party:
            card = tk.Frame(inner, bg=CARD)
            card.pack(fill="x", padx=24, pady=4)
            tk.Label(card, text=lib_name, bg=CARD, fg=self.accent,
                     font=(FONT_FAMILY_UI, 11, "bold")).pack(anchor="w", padx=14, pady=(10, 0))
            tk.Label(card, text=desc, bg=CARD, fg=TEXT, font=FONT_SMALL,
                     wraplength=480, justify="left").pack(anchor="w", padx=14, pady=(2, 0))
            tk.Label(card, text=license_note, bg=CARD, fg=SUBTEXT, font=FONT_SMALL,
                     wraplength=480, justify="left").pack(anchor="w", padx=14, pady=(2, 10))

        tk.Label(inner, text=tr("about_license_disclaimer"),
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL, wraplength=520, justify="left").pack(
            anchor="w", padx=24, pady=(8, 20))

        tk.Label(inner, text=tr("about_contact_header"), bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 13, "bold")).pack(anchor="w", padx=24, pady=(0, 8))
        contact_card = tk.Frame(inner, bg=CARD)
        contact_card.pack(fill="x", padx=24, pady=(0, 12))
        tk.Label(contact_card, text=tr("about_contact_discord_label"), bg=CARD, fg=self.accent,
                 font=(FONT_FAMILY_UI, 11, "bold")).pack(anchor="w", padx=14, pady=(10, 0))
        tk.Label(contact_card, text="rawwwwwrr", bg=CARD, fg=TEXT, font=FONT_MAIN).pack(
            anchor="w", padx=14, pady=(2, 12))

        github_card = tk.Frame(inner, bg=CARD)
        github_card.pack(fill="x", padx=24, pady=(0, 30))
        tk.Label(github_card, text=tr("about_contact_github_label"), bg=CARD, fg=self.accent,
                 font=(FONT_FAMILY_UI, 11, "bold")).pack(anchor="w", padx=14, pady=(10, 0))
        github_link = tk.Label(github_card, text=tr("about_github_link_text"), bg=CARD, fg=self.accent,
                                font=(FONT_FAMILY_UI, 11, "underline"), cursor="hand2")
        github_link.pack(anchor="w", padx=14, pady=(2, 12))
        github_link.bind("<Button-1>", lambda e: webbrowser.open(GITHUB_URL))

    def _make_stat_card(self, parent, label, value):
        card = tk.Frame(parent, bg=CARD)
        card.pack(side="left", expand=True, fill="both", padx=6)
        tk.Label(card, text=label, bg=CARD, fg=SUBTEXT, font=FONT_SMALL).pack(pady=(14, 4))
        val_label = tk.Label(card, text=value, bg=CARD, fg=self.accent, font=(FONT_FAMILY_UI, 22, "bold"))
        val_label.pack(pady=(0, 14))
        return val_label

    def _refresh_data_tab(self):
        if not hasattr(self, "data_tree"):
            return
        total_seconds = 0
        completed_count = 0
        for info in self.data["profiles"].values():
            total_seconds += info.get("seconds", 0)
            if info.get("status") == "completed":
                completed_count += 1

        self.stat_total_time_label.config(text=format_seconds(total_seconds))
        self.stat_games_tracked_label.config(text=str(len(self.data["profiles"])))
        self.stat_completed_label.config(text=str(completed_count))

        self.data_tree.delete(*self.data_tree.get_children())
        self.data_thumb_refs = {}
        status_label_keys = {
            "completed": "status_completed", "dropped": "status_dropped",
            "on_hold": "status_on_hold", "in_progress": "status_in_progress",
        }
        for i, (name, info) in enumerate(self._get_sorted_profiles_all()):
            status_key = status_label_keys.get(info.get("status"), "status_in_progress")
            status = tr(status_key)
            completed_on = info.get("status_at") or "\u2014"
            status_seconds = info.get("status_seconds")
            completed_time = format_seconds(status_seconds) if status_seconds is not None else "\u2014"
            row_tag = "rowA" if i % 2 == 0 else "rowB"

            icon_file = info.get("icon_file")
            img = None
            if icon_file:
                path = os.path.join(ICONS_DIR, icon_file)
                if os.path.exists(path):
                    img = self._load_thumbnail(path, size=(24, 24))

            kwargs = dict(
                text=" " + name,
                values=(format_seconds(info.get("seconds", 0)), status, completed_on, completed_time,
                        self._rating_stars(info.get("rating", 0)) or "—",
                        ", ".join(tr_genre(g) for g in info.get("genres", ["Uncategorized"]))),
                tags=(row_tag,),
            )
            if img:
                self.data_thumb_refs[name] = img
                kwargs["image"] = img
            self.data_tree.insert("", "end", **kwargs)

    def _bind_mousewheel(self, window, scrollable):
        """Makes the mouse wheel scroll `scrollable` (a Canvas or Listbox) while
        the cursor is anywhere inside `window`. Canvas widgets don't get wheel
        scrolling for free in Tkinter — only the scrollbar drag did before this."""
        def on_wheel(event):
            delta = -1 if event.delta > 0 else 1
            scrollable.yview_scroll(delta, "units")
        window.bind("<MouseWheel>", on_wheel)

    def _safe_save(self):
        """Save and surface any failure clearly — silent save failures are
        how you end up with an app that looks 'bugged' with no explanation."""
        try:
            save_data(self.data)
            return True
        except Exception as e:
            messagebox.showerror(tr("err_cant_save_title"), tr("err_cant_save_msg", reason=str(e)))
            return False

    @staticmethod
    def _rating_stars(rating):
        rating = int(rating or 0)
        if rating <= 0:
            return ""
        rating = max(0, min(5, rating))
        return "★" * rating + "☆" * (5 - rating)

    @staticmethod
    def _hex_to_rgb(hex_color):
        hex_color = hex_color.lstrip("#")
        return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))

    def _make_toggle_image(self, on):
        """Renders a rounded phone-settings-style on/off switch — track color
        is the theme accent when on, a muted version of the panel color when
        off, with a white knob that slides to whichever side is active."""
        w, h = 68, 32
        pad = 3
        knob_d = h - pad * 2
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        if on:
            track_rgb = self._hex_to_rgb(self.accent)
        else:
            track_rgb = self._hex_to_rgb(self._shift_color(PANEL, 40))
        draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=h // 2, fill=(*track_rgb, 255))
        knob_x = w - pad - knob_d if on else pad
        draw.ellipse([knob_x, pad, knob_x + knob_d, pad + knob_d], fill=(255, 255, 255, 255))
        return ImageTk.PhotoImage(img)

    def _update_complete_toggle_visual(self):
        """Redraws the Complete toggle (or the fallback button, if Pillow
        isn't available) to match the selected profile's completed state."""
        completed = bool(self.selected and self.data["profiles"][self.selected].get("status") == "completed")
        if PIL_AVAILABLE and self.complete_toggle_id is not None:
            self._toggle_photo = self._make_toggle_image(completed)
            self.canvas.itemconfig(self.complete_toggle_id, image=self._toggle_photo)
        elif self.complete_button is not None:
            if completed:
                self.complete_button.config(bg=self.accent, activebackground=self.accent)
                self._add_hover(self.complete_button, self.accent)
            else:
                self.complete_button.config(bg=GOLD, activebackground=GOLD)
                self._add_hover(self.complete_button, GOLD)

    @staticmethod
    def _shift_color(hex_color, amount):
        """Lighten (positive amount) or darken (negative) a #rrggbb color."""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) != 6:
            return "#" + hex_color
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        r = max(0, min(255, r + amount))
        g = max(0, min(255, g + amount))
        b = max(0, min(255, b + amount))
        return f"#{r:02x}{g:02x}{b:02x}"

    def _add_hover(self, button, base_bg):
        """Buttons that don't visually react to the mouse are a big part of why
        a plain Tkinter UI reads as unfinished — this gives every button a
        subtle lighten-on-hover / darken-on-press response."""
        hover_bg = self._shift_color(base_bg, 22)
        press_bg = self._shift_color(base_bg, -18)
        button.config(activebackground=press_bg)
        button.bind("<Enter>", lambda e: button.config(bg=hover_bg))
        button.bind("<Leave>", lambda e: button.config(bg=base_bg))
        button.bind("<ButtonPress-1>", lambda e: button.config(bg=press_bg))
        button.bind("<ButtonRelease-1>", lambda e: button.config(bg=hover_bg))

    def _center_window(self, win, width, height, parent=None):
        """Position a Toplevel centered over its parent window instead of
        wherever the window manager's default placement happens to land it
        (often the top-left corner of the monitor, not the app)."""
        parent = parent or self.root
        parent.update_idletasks()
        parent_x = parent.winfo_rootx()
        parent_y = parent.winfo_rooty()
        parent_w = parent.winfo_width()
        parent_h = parent.winfo_height()
        x = parent_x + (parent_w - width) // 2
        y = parent_y + (parent_h - height) // 2
        win.geometry(f"{width}x{height}+{max(0, x)}+{max(0, y)}")

    def _make_button(self, parent, text, command, bg, fg, width=16, font=None):
        btn = tk.Button(
            parent, text=text, command=command, bg=bg, fg=fg,
            activebackground=bg, activeforeground=fg, bd=0, highlightthickness=0,
            relief="flat", font=font or FONT_MAIN, width=width, cursor="hand2"
        )
        self._add_hover(btn, bg)
        return btn

    # ---------- Canvas layout / background ----------
    def _reposition_canvas_items(self, event=None):
        w = self.canvas.winfo_width()
        h = self.canvas.winfo_height()
        if w < 10 or h < 10:
            return
        cx = w // 2
        scale = max(0.75, min(2.3, h / 480))
        title_font = (FONT_FAMILY_UI, max(11, int(FONT_TITLE_BASE * scale)), "bold")
        timer_font = ("Consolas", max(22, int(FONT_TIMER_BASE * scale)), "bold")

        self.canvas.coords(self.title_id, cx, int(h * 0.13))
        self.canvas.itemconfig(self.title_id, font=title_font)
        self.canvas.coords(self.status_id, cx, int(h * 0.20))
        self.canvas.coords(self.rating_id, cx, int(h * 0.27))
        self.canvas.coords(self.timer_id, cx, int(h * 0.45))
        self.canvas.itemconfig(self.timer_id, font=timer_font)

        btn_y = int(h * 0.68)
        gap = max(70, int(70 * scale * 0.6))
        self.canvas.coords(self.play_window_id, cx - gap, btn_y)
        if PIL_AVAILABLE and self.complete_toggle_id is not None:
            toggle_cx = cx + gap
            self.canvas.coords(self.complete_toggle_label_id, toggle_cx - 40, btn_y)
            self.canvas.coords(self.complete_toggle_id, toggle_cx + 12, btn_y)
        elif self.reset_window_id is not None:
            self.canvas.coords(self.reset_window_id, cx + gap, btn_y)
        self.canvas.coords(self.hint_id, cx, h - 20)

        self._render_background()

    def _render_background(self):
        profile = self.data["profiles"].get(self.selected) if self.selected else None
        bg_image = profile.get("bg_image") if profile else None
        bg_color = profile.get("bg_color") if profile else None

        if self.bg_image_id is not None:
            self.canvas.delete(self.bg_image_id)
            self.bg_image_id = None
        if self.timer_panel_id is not None:
            self.canvas.delete(self.timer_panel_id)
            self.timer_panel_id = None

        if bg_image and PIL_AVAILABLE:
            path = os.path.join(BACKGROUNDS_DIR, bg_image)
            if os.path.exists(path):
                w = max(self.canvas.winfo_width(), 10)
                h = max(self.canvas.winfo_height(), 10)
                try:
                    # Cache the decoded source image per path so dragging to
                    # resize the window (many rapid Configure events) only
                    # re-crops/re-scales an already-open image instead of
                    # re-reading and re-decoding the file from disk each time.
                    if self._bg_source_path != path:
                        self._bg_source_image = Image.open(path).convert("RGB")
                        self._bg_source_path = path
                    img = ImageOps.fit(self._bg_source_image, (w, h), Image.LANCZOS)
                    self.bg_photo = ImageTk.PhotoImage(img)
                    self.bg_image_id = self.canvas.create_image(0, 0, anchor="nw", image=self.bg_photo)
                    self.canvas.tag_lower(self.bg_image_id)
                    self._render_timer_panel(w, h)
                    return
                except Exception:
                    pass

        self.canvas.config(bg=bg_color or BG)

    def _render_timer_panel(self, w, h):
        """A low-opacity dark rounded panel behind title/status/timer, so the
        numbers stay readable against any custom background image."""
        if not PIL_AVAILABLE:
            return
        panel_w = int(min(w * 0.55, 480))
        top_frac, bottom_frac = 0.06, 0.58
        panel_h = max(60, int(h * (bottom_frac - top_frac)))
        panel_img = Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(panel_img)
        draw.rounded_rectangle([0, 0, panel_w - 1, panel_h - 1], radius=28, fill=(15, 15, 24, 115))
        self.timer_panel_photo = ImageTk.PhotoImage(panel_img)
        cx = w // 2
        cy = int(h * top_frac) + panel_h // 2
        self.timer_panel_id = self.canvas.create_image(cx, cy, image=self.timer_panel_photo)
        self.canvas.tag_lower(self.timer_panel_id, self.title_id)

    # ---------- Profile list helpers ----------
    def _load_thumbnail(self, path, size=None):
        if not PIL_AVAILABLE:
            return None
        size = size or (self.icon_size, self.icon_size)
        try:
            img = Image.open(path).convert("RGBA")
            img.thumbnail(size, Image.LANCZOS)
            canvas = Image.new("RGBA", size, (0, 0, 0, 0))
            offset = ((size[0] - img.width) // 2, (size[1] - img.height) // 2)
            canvas.paste(img, offset, img)
            return ImageTk.PhotoImage(canvas)
        except Exception:
            return None

    def _sort_profile_items(self, items):
        if self.sort_mode == "last_played":
            items.sort(key=lambda x: x[1].get("last_played") or 0, reverse=True)
        elif self.sort_mode == "genre":
            items.sort(key=lambda x: (", ".join(x[1].get("genres", ["Uncategorized"])), x[0].lower()))
        elif self.sort_mode == "rating":
            items.sort(key=lambda x: x[1].get("rating", 0), reverse=True)
        else:  # "name"
            items.sort(key=lambda x: x[0].lower())
        return items

    def _get_sorted_filtered_profiles(self):
        items = list(self.data["profiles"].items())
        if self.genre_filter != "All":
            items = [(n, i) for n, i in items if self.genre_filter in i.get("genres", ["Uncategorized"])]
        return self._sort_profile_items(items)

    def _get_sorted_profiles_all(self):
        """Same ordering as the Games list's current Sort setting, but never
        genre-filtered — the Data tab is meant to show every tracked game."""
        return self._sort_profile_items(list(self.data["profiles"].items()))

    def _refresh_profile_list(self):
        self.tree.delete(*self.tree.get_children())
        self.thumb_refs = {}
        items = self._get_sorted_filtered_profiles()
        if not items:
            if self.data["profiles"]:
                msg = tr("empty_genre_filter", genre=tr_genre(self.genre_filter))
            else:
                msg = tr("empty_no_games")
            self.tree.insert("", "end", iid="__empty__", text="  " + msg, tags=("empty",))
            self.tree.tag_configure("empty", foreground=SUBTEXT)
            return
        self.tree.tag_configure("running", foreground=GREEN)
        for name, info in items:
            icon_file = info.get("icon_file")
            img = None
            if icon_file:
                path = os.path.join(ICONS_DIR, icon_file)
                if os.path.exists(path):
                    img = self._load_thumbnail(path)
            # Any number of games can be running at once now, not just the
            # selected one — mark every one that's actively ticking so it
            # doesn't look like its time silently stopped in the background.
            running = name in self.active_timers
            label = ("▶ " if running else " ") + name
            tags = ("running",) if running else ()
            if img:
                self.thumb_refs[name] = img
                self.tree.insert("", "end", iid=name, text=label, image=img, tags=tags)
            else:
                self.tree.insert("", "end", iid=name, text=label, tags=tags)
        self._highlight_selected()

    def _highlight_selected(self):
        if self.selected and self.tree.exists(self.selected):
            self.tree.selection_set(self.selected)
            self.tree.see(self.selected)

    def _on_tree_select(self, event):
        sel = self.tree.selection()
        if not sel or sel[0] == "__empty__":
            return
        name = sel[0]
        if name != self.selected:
            self._select_profile(name)

    def _select_profile(self, name):
        # Switching the selected game no longer pauses anything — any number
        # of games can have their timers running concurrently. Selecting a
        # game just changes which one the timer display and Play/Pause
        # button are currently pointed at.
        self.selected = name
        self.data["last_selected"] = name
        self._safe_save()
        self.canvas.itemconfig(self.title_id, text=name)
        self.canvas.itemconfig(self.rating_id, text=self._rating_stars(
            self.data["profiles"][name].get("rating", 0)))
        self._update_timer_display()
        self._highlight_selected()
        self._set_play_button_state()
        self._update_complete_toggle_visual()
        self._render_background()

    # ---------- Sort / Filter ----------
    def _open_sort_menu(self):
        menu = tk.Menu(self.root, tearoff=0, bg=CARD, fg=TEXT,
                        activebackground=self.accent, activeforeground="#1e1e2e")
        options = [("name", tr("sort_name_az")), ("last_played", tr("sort_last_played")),
                   ("rating", tr("sort_rating_desc")), ("genre", tr("sort_genre_az"))]
        for mode, label in options:
            prefix = "\u2713 " if self.sort_mode == mode else "    "
            menu.add_command(label=prefix + label, command=lambda m=mode: self._set_sort_mode(m))
        x = self.root.winfo_pointerx()
        y = self.root.winfo_pointery()
        try:
            menu.tk_popup(x, y)
        finally:
            menu.grab_release()

    def _set_sort_mode(self, mode):
        self.sort_mode = mode
        self.data["settings"]["sort_mode"] = mode
        self._safe_save()
        self._refresh_profile_list()

    def _open_filter_menu(self):
        menu = tk.Menu(self.root, tearoff=0, bg=CARD, fg=TEXT,
                        activebackground=self.accent, activeforeground="#1e1e2e")
        used_genres = set()
        for p in self.data["profiles"].values():
            used_genres.update(p.get("genres", ["Uncategorized"]))
        choices = ["All"] + sorted(used_genres)
        for genre in choices:
            prefix = "\u2713 " if self.genre_filter == genre else "    "
            label = tr("filter_all") if genre == "All" else tr_genre(genre)
            menu.add_command(label=prefix + label, command=lambda g=genre: self._set_genre_filter(g))
        x = self.root.winfo_pointerx()
        y = self.root.winfo_pointery()
        try:
            menu.tk_popup(x, y)
        finally:
            menu.grab_release()

    def _set_genre_filter(self, genre):
        self.genre_filter = genre
        self.data["settings"]["genre_filter"] = genre
        self._safe_save()
        self._refresh_profile_list()

    # ---------- Modify Game (tabbed) ----------
    def _open_modify_game(self):
        """Everything that edits a game's identity/data lives in one tabbed
        window, kept separate from the quick actions (Duplicate, Reset Time,
        Rate Game, Export/Import, Delete) that stay on the right-click menu."""
        if not self.selected:
            return
        profile_name = self.selected
        win = tk.Toplevel(self.root)
        win.title(tr("dlg_modify_title", name=profile_name))
        win.configure(bg=BG)
        self._center_window(win, 500, 540)
        # Keep a floor on the window size — shrink it too far and the 4 tab
        # labels get clipped to unreadable fragments by ttk's Notebook.
        win.minsize(460, 420)
        win.transient(self.root)
        win.grab_set()

        notebook = ttk.Notebook(win)
        notebook.pack(fill="both", expand=True, padx=10, pady=(10, 4))

        tab_general = tk.Frame(notebook, bg=BG)
        tab_time = tk.Frame(notebook, bg=BG)
        tab_appearance = tk.Frame(notebook, bg=BG)
        tab_genres = tk.Frame(notebook, bg=BG)
        notebook.add(tab_general, text=tr("tab_modify_general"))
        notebook.add(tab_time, text=tr("tab_modify_time"))
        notebook.add(tab_appearance, text=tr("tab_modify_appearance"))
        notebook.add(tab_genres, text=tr("tab_modify_genres"))

        self._build_modify_general_tab(tab_general, profile_name, win)
        self._build_modify_time_tab(tab_time, profile_name)
        self._build_modify_appearance_tab(tab_appearance, profile_name, win)
        self._build_modify_genres_tab(tab_genres, profile_name)

        bottom_bar = tk.Frame(win, bg=BG)
        bottom_bar.pack(side="bottom", fill="x")
        self._make_button(bottom_bar, tr("btn_close"), win.destroy, bg=CARD, fg=TEXT).pack(
            side="left", expand=True, fill="x", padx=(10, 0), pady=(0, 10))
        # The OS window-edge resize handle is razor-thin and easy to miss —
        # ttk.Sizegrip gives a much bigger, obvious drag target in the corner.
        ttk.Sizegrip(bottom_bar).pack(side="right", anchor="se", padx=(4, 4), pady=(0, 4))

    def _build_modify_general_tab(self, parent, profile_name, win):
        tk.Label(parent, text=tr("dlg_rename_title"), bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 12, "bold")).pack(anchor="w", padx=16, pady=(18, 4))
        tk.Label(parent, text=profile_name, bg=BG, fg=SUBTEXT, font=FONT_SMALL,
                 wraplength=360, justify="left").pack(anchor="w", padx=16, pady=(0, 6))

        def do_rename():
            # Renaming changes the profile's identity key, which every other
            # tab in this window still refers to by its old name — closing
            # the window is simpler and safer than trying to re-point them.
            old_name = profile_name
            self._rename_profile()
            if self.selected != old_name:
                win.destroy()

        self._make_button(parent, tr("ctx_rename"), do_rename, bg=CARD, fg=TEXT).pack(
            anchor="w", padx=16, pady=(0, 20), fill="x")

        tk.Label(parent, text=tr("label_status"), bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 12, "bold")).pack(anchor="w", padx=16, pady=(0, 6))

        status_row = tk.Frame(parent, bg=BG)
        status_row.pack(anchor="w", padx=16, fill="x")
        status_info = tk.Label(parent, text="", bg=BG, fg=SUBTEXT, font=FONT_SMALL,
                                wraplength=360, justify="left")

        status_options = [
            ("in_progress", tr("status_in_progress")),
            ("completed", tr("status_completed")),
            ("dropped", tr("status_dropped")),
            ("on_hold", tr("status_on_hold")),
        ]
        status_buttons = {}

        def refresh_status_ui():
            profile = self.data["profiles"][profile_name]
            current = profile.get("status", "in_progress")
            for key, btn in status_buttons.items():
                active = key == current
                bg = self.accent if active else CARD
                fg = "#1e1e2e" if active else TEXT
                btn.config(bg=bg, fg=fg, activebackground=bg, activeforeground=fg)
                self._add_hover(btn, bg)  # re-bind hover targets to the new base color
            if current != "in_progress" and profile.get("status_at"):
                status_seconds = profile.get("status_seconds")
                stamp = format_seconds(status_seconds) if status_seconds is not None else "—"
                status_info.config(text=tr("label_status_snapshot", date=profile["status_at"], time=stamp))
                status_info.pack(anchor="w", padx=16, pady=(6, 10))
            else:
                status_info.pack_forget()

        def make_setter(key):
            def setter():
                self._set_status(key)
                refresh_status_ui()
            return setter

        for key, label in status_options:
            btn = self._make_button(status_row, label, make_setter(key), bg=CARD, fg=TEXT,
                                     width=8, font=FONT_SMALL)
            btn.pack(side="left", padx=(0, 4), pady=(0, 2), expand=True, fill="x")
            status_buttons[key] = btn

        refresh_status_ui()

    def _build_modify_time_tab(self, parent, profile_name):
        tk.Label(parent, text=tr("dlg_add_time_desc"), bg=BG, fg=SUBTEXT, font=FONT_SMALL,
                 wraplength=360, justify="left").pack(padx=16, pady=(18, 14), anchor="w")

        direction_var = tk.StringVar(value="add")
        direction_row = tk.Frame(parent, bg=BG)
        direction_row.pack(padx=16, pady=(0, 10), fill="x")
        tk.Radiobutton(
            direction_row, text=tr("label_add"), variable=direction_var, value="add",
            bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
            activeforeground=TEXT, font=FONT_MAIN, highlightthickness=0, bd=0
        ).pack(side="left", expand=True, fill="x")
        tk.Radiobutton(
            direction_row, text=tr("label_remove"), variable=direction_var, value="remove",
            bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
            activeforeground=TEXT, font=FONT_MAIN, highlightthickness=0, bd=0
        ).pack(side="left", expand=True, fill="x")

        hours_row = tk.Frame(parent, bg=BG)
        hours_row.pack(padx=16, pady=(0, 10), fill="x")
        tk.Label(hours_row, text=tr("label_hours"), bg=BG, fg=TEXT, font=FONT_MAIN,
                 width=8, anchor="w").pack(side="left")
        hours_var = tk.StringVar(value="0")
        tk.Entry(hours_row, textvariable=hours_var, bg=CARD, fg=TEXT, insertbackground=TEXT, bd=0,
                 highlightthickness=1, highlightbackground=CARD, highlightcolor=self.accent,
                 font=FONT_MAIN, width=6).pack(side="left", ipady=4)

        minutes_row = tk.Frame(parent, bg=BG)
        minutes_row.pack(padx=16, pady=(0, 14), fill="x")
        tk.Label(minutes_row, text=tr("label_minutes"), bg=BG, fg=TEXT, font=FONT_MAIN,
                 width=8, anchor="w").pack(side="left")
        minutes_var = tk.StringVar(value="0")
        tk.Entry(minutes_row, textvariable=minutes_var, bg=CARD, fg=TEXT, insertbackground=TEXT, bd=0,
                 highlightthickness=1, highlightbackground=CARD, highlightcolor=self.accent,
                 font=FONT_MAIN, width=6).pack(side="left", ipady=4)

        tk.Label(parent, text=tr("label_note_optional"), bg=BG, fg=TEXT, font=FONT_MAIN).pack(
            anchor="w", padx=16)
        note_var = tk.StringVar(value="")
        tk.Entry(parent, textvariable=note_var, bg=CARD, fg=TEXT, insertbackground=TEXT, bd=0,
                 highlightthickness=1, highlightbackground=CARD, highlightcolor=self.accent,
                 font=FONT_MAIN).pack(fill="x", padx=16, pady=(4, 2), ipady=4)
        tk.Label(parent, text=tr("hint_note_example"), bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(
            anchor="w", padx=16, pady=(0, 14))

        def apply_time():
            try:
                h = int(hours_var.get() or 0)
                m = int(minutes_var.get() or 0)
            except ValueError:
                messagebox.showwarning(tr("dlg_add_time_title"), tr("err_add_time_empty"))
                return
            delta_seconds = h * 3600 + m * 60
            if delta_seconds <= 0:
                messagebox.showwarning(tr("dlg_add_time_title"), tr("err_add_time_empty"))
                return
            removing = direction_var.get() == "remove"
            profile = self.data["profiles"][profile_name]
            if removing:
                profile["seconds"] = max(0, profile.get("seconds", 0) - delta_seconds)
            else:
                profile["seconds"] = profile.get("seconds", 0) + delta_seconds
                profile["last_played"] = time.time()
            note = note_var.get().strip()
            if note:
                timestamp = time.strftime("%Y-%m-%d")
                hm = f"{h}h {m}m" if h else f"{m}m"
                sign = "-" if removing else "+"
                new_line = f"[{timestamp}] {sign}{hm} — {note}"
                existing_notes = profile.get("notes", "")
                profile["notes"] = (existing_notes + "\n" + new_line) if existing_notes else new_line
            self._safe_save()
            write_log_file(self.data)
            if self.selected == profile_name:
                self._update_timer_display()
            self._refresh_profile_list()
            hours_var.set("0")
            minutes_var.set("0")
            note_var.set("")

        self._make_button(parent, tr("btn_save"), apply_time, bg=self.accent, fg="#1e1e2e").pack(
            fill="x", padx=16, pady=(0, 16))

    def _build_modify_appearance_tab(self, parent, profile_name, win):
        tk.Label(parent, text=tr("label_icon"), bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 12, "bold")).pack(anchor="w", padx=16, pady=(18, 6))
        icon_row = tk.Frame(parent, bg=BG)
        icon_row.pack(anchor="w", padx=16, pady=(0, 4), fill="x")
        icon_preview = tk.Label(icon_row, bg=BG)
        icon_preview.pack(side="left", padx=(0, 10))

        def refresh_icon_preview():
            icon_file = self.data["profiles"][profile_name].get("icon_file")
            img = None
            if icon_file:
                path = os.path.join(ICONS_DIR, icon_file)
                if os.path.exists(path):
                    img = self._load_thumbnail(path, size=(40, 40))
            if img:
                icon_preview.config(image=img, text="")
                icon_preview.image = img
            else:
                icon_preview.config(image="", text="—", fg=SUBTEXT)
                icon_preview.image = None

        refresh_icon_preview()

        def change_icon():
            self._set_profile_icon()
            refresh_icon_preview()

        self._make_button(icon_row, tr("ctx_change_icon"), change_icon, bg=CARD, fg=TEXT).pack(side="left")

        tk.Label(parent, text=tr("label_background"), bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 12, "bold")).pack(anchor="w", padx=16, pady=(20, 6))

        def choose_color():
            c = colorchooser.askcolor(parent=win, title=tr("dlg_choose_bg_color_title"))
            if c and c[1]:
                self.data["profiles"][profile_name]["bg_color"] = c[1]
                self.data["profiles"][profile_name]["bg_image"] = None
                self._safe_save()
                if self.selected == profile_name:
                    self._render_background()

        def choose_image():
            if not PIL_AVAILABLE:
                messagebox.showerror(tr("err_missing_dep_title"), tr("err_missing_dep_bg_msg"))
                return
            path = filedialog.askopenfilename(
                title=tr("dlg_choose_bg_image_title"),
                filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp *.webp")]
            )
            if not path:
                return
            os.makedirs(BACKGROUNDS_DIR, exist_ok=True)
            ext = os.path.splitext(path)[1].lower() or ".png"
            fname = f"{uuid.uuid4().hex}{ext}"
            dest = os.path.join(BACKGROUNDS_DIR, fname)
            try:
                shutil.copy(path, dest)
            except Exception as e:
                messagebox.showerror(tr("err_set_bg_title"), str(e))
                return
            old = self.data["profiles"][profile_name].get("bg_image")
            if old:
                old_path = os.path.join(BACKGROUNDS_DIR, old)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except OSError:
                        pass
            self.data["profiles"][profile_name]["bg_image"] = fname
            self.data["profiles"][profile_name]["bg_color"] = None
            self._safe_save()
            if self.selected == profile_name:
                self._render_background()

        def reset_default():
            self.data["profiles"][profile_name]["bg_color"] = None
            self.data["profiles"][profile_name]["bg_image"] = None
            self._safe_save()
            if self.selected == profile_name:
                self._render_background()

        self._make_button(parent, tr("btn_choose_solid_color"), choose_color, bg=CARD, fg=TEXT).pack(
            fill="x", padx=16, pady=4)
        self._make_button(parent, tr("btn_choose_image"), choose_image, bg=CARD, fg=TEXT).pack(
            fill="x", padx=16, pady=4)
        self._make_button(parent, tr("btn_reset_default"), reset_default, bg=CARD, fg=RED).pack(
            fill="x", padx=16, pady=(4, 10))

    def _build_modify_genres_tab(self, parent, profile_name):
        tk.Label(parent, text=tr("note_select_genres"), bg=BG, fg=SUBTEXT, font=FONT_SMALL,
                 wraplength=360, justify="left").pack(anchor="w", padx=16, pady=(16, 10))

        list_frame = tk.Frame(parent, bg=BG)
        list_frame.pack(fill="both", expand=True, padx=16, pady=(0, 10))
        scrollbar = ttk.Scrollbar(list_frame, orient="vertical")
        scrollbar.pack(side="right", fill="y")
        listbox = tk.Listbox(list_frame, bg=CARD, fg=TEXT, selectbackground=self.accent,
                              selectforeground="#1e1e2e", bd=0, highlightthickness=0,
                              font=FONT_MAIN, activestyle="none", selectmode="multiple",
                              yscrollcommand=scrollbar.set)
        listbox.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=listbox.yview)

        current_genres = self.data["profiles"][profile_name].get("genres", ["Uncategorized"])
        for i, genre in enumerate(GENRE_OPTIONS):
            listbox.insert("end", tr_genre(genre))
            if genre in current_genres:
                listbox.selection_set(i)

        def assign():
            sel = listbox.curselection()
            # Index into the canonical GENRE_OPTIONS rather than reading the
            # (possibly translated) listbox text, so stored genres always stay
            # in the English canonical form regardless of display language.
            genres = [GENRE_OPTIONS[i] for i in sel] or ["Uncategorized"]
            self.data["profiles"][profile_name]["genres"] = genres
            self._safe_save()
            write_log_file(self.data)
            self._refresh_profile_list()

        self._make_button(parent, tr("btn_assign"), assign, bg=self.accent, fg="#1e1e2e").pack(
            fill="x", padx=16, pady=(0, 16))

    def _open_notes(self):
        if not self.selected:
            return
        profile_name = self.selected
        win = tk.Toplevel(self.root)
        win.title(tr("dlg_notes_title", name=profile_name))
        win.configure(bg=BG)
        self._center_window(win, 380, 420)
        win.transient(self.root)
        win.grab_set()

        tk.Label(win, text=tr("label_notes"), bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(16, 6))

        text_frame = tk.Frame(win, bg=BG)
        text_frame.pack(fill="both", expand=True, padx=16)
        scrollbar = ttk.Scrollbar(text_frame, orient="vertical")
        scrollbar.pack(side="right", fill="y")
        text_widget = tk.Text(text_frame, bg=CARD, fg=TEXT, insertbackground=TEXT, bd=0,
                               highlightthickness=1, highlightbackground=CARD, highlightcolor=self.accent,
                               font=FONT_MAIN, wrap="word", yscrollcommand=scrollbar.set)
        text_widget.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=text_widget.yview)
        text_widget.insert("1.0", self.data["profiles"][profile_name].get("notes", ""))

        def save_and_close():
            self.data["profiles"][profile_name]["notes"] = text_widget.get("1.0", "end-1c")
            self._safe_save()
            win.destroy()

        btn_row = tk.Frame(win, bg=BG)
        btn_row.pack(fill="x", padx=16, pady=16)
        self._make_button(btn_row, tr("btn_save"), save_and_close, bg=self.accent, fg="#1e1e2e").pack(
            side="left", expand=True, fill="x", padx=(0, 4))
        self._make_button(btn_row, tr("btn_close"), win.destroy, bg=CARD, fg=TEXT).pack(
            side="left", expand=True, fill="x", padx=(4, 0))

    # ---------- Context menu ----------
    def _show_context_menu(self, event):
        iid = self.tree.identify_row(event.y)
        if iid == "__empty__":
            iid = None
        menu = tk.Menu(self.root, tearoff=0, bg=CARD, fg=TEXT,
                        activebackground=self.accent, activeforeground="#1e1e2e")
        if iid:
            self.tree.selection_set(iid)
            self._select_profile(iid)
            menu.add_command(label=tr("ctx_modify"), command=self._open_modify_game)
            menu.add_command(label=tr("ctx_duplicate"), command=self._duplicate_profile)
            menu.add_command(label=tr("ctx_reset_time"), command=self._reset_time)
            menu.add_command(label=tr("ctx_rate_game"), command=self._open_rate_game)
            menu.add_command(label=tr("ctx_notes"), command=self._open_notes)
            menu.add_separator()
            menu.add_command(label=tr("ctx_export"), command=self._export_profile)
            menu.add_command(label=tr("ctx_import"), command=self._import_profile)
            menu.add_separator()
            menu.add_command(label=tr("ctx_delete"), command=self._delete_profile)
        else:
            menu.add_command(label=tr("menu_add_game"), command=self._new_profile)
            menu.add_command(label=tr("ctx_import"), command=self._import_profile)
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    # ---------- Profile CRUD ----------
    def _new_profile(self):
        name = simpledialog.askstring(tr("dlg_add_game_title"), tr("dlg_add_game_prompt"), parent=self.root)
        if not name:
            return
        name = name.strip()
        if not name:
            return
        if name in self.data["profiles"]:
            messagebox.showwarning(tr("warn_already_exists_title"), tr("warn_already_exists_msg"))
            return
        self.data["profiles"][name] = {"seconds": 0, "icon_file": None, "bg_color": None, "bg_image": None,
                                        "status": "in_progress", "status_at": None, "status_seconds": None,
                                        "genres": ["Uncategorized"], "last_played": None, "notes": "",
                                        "rating": 0}
        self._safe_save()
        write_log_file(self.data)
        self._refresh_profile_list()
        self._select_profile(name)

    def _rename_profile(self):
        if not self.selected:
            return
        new_name = simpledialog.askstring(tr("dlg_rename_title"), tr("dlg_rename_prompt"),
                                           initialvalue=self.selected, parent=self.root)
        if not new_name:
            return
        new_name = new_name.strip()
        if not new_name or new_name == self.selected:
            return
        if new_name in self.data["profiles"]:
            messagebox.showwarning(tr("warn_already_exists_title"), tr("warn_already_exists_msg"))
            return
        old_name = self.selected
        self.data["profiles"][new_name] = self.data["profiles"].pop(old_name)
        if old_name in self.active_timers:
            # Preserve a running timer's live tick_start across the rename
            # instead of pausing/restarting it, so no progress is lost.
            self.active_timers[new_name] = self.active_timers.pop(old_name)
        self.selected = new_name
        self.data["last_selected"] = new_name
        self._safe_save()
        write_log_file(self.data)
        self._refresh_profile_list()
        self.canvas.itemconfig(self.title_id, text=new_name)
        self._set_play_button_state()

    def _delete_profile(self):
        if not self.selected:
            return
        if not messagebox.askyesno(tr("confirm_delete_title"),
                                    tr("confirm_delete_msg", name=self.selected)):
            return
        self.active_timers.pop(self.selected, None)
        info = self.data["profiles"][self.selected]
        for key, folder in (("icon_file", ICONS_DIR), ("bg_image", BACKGROUNDS_DIR)):
            fname = info.get(key)
            if fname:
                p = os.path.join(folder, fname)
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except OSError:
                        pass
        del self.data["profiles"][self.selected]
        self.selected = None
        self.data["last_selected"] = None
        self._safe_save()
        write_log_file(self.data)
        self._refresh_profile_list()
        self.canvas.itemconfig(self.title_id, text=tr("canvas_no_profile_selected"))
        self.canvas.itemconfig(self.rating_id, text="")
        self.canvas.itemconfig(self.timer_id, text="00:00:00")
        self._set_play_button_state()
        self._update_complete_toggle_visual()
        self._render_background()

    def _reset_time(self):
        if not self.selected:
            return
        if not messagebox.askyesno(tr("confirm_reset_time_title"),
                                    tr("confirm_reset_time_msg", name=self.selected)):
            return
        self.data["profiles"][self.selected]["seconds"] = 0
        if self.selected in self.active_timers:
            self.active_timers[self.selected] = time.time()
        self._safe_save()
        self._update_timer_display()

    # ---------- Manual time entry ----------
    def _open_rate_game(self):
        if not self.selected:
            return
        profile_name = self.selected
        win = tk.Toplevel(self.root)
        win.title(tr("dlg_rate_game_title", name=profile_name))
        win.configure(bg=BG)
        self._center_window(win, 300, 180)
        win.resizable(False, False)
        win.transient(self.root)
        win.grab_set()

        tk.Label(win, text=tr("label_rating"), bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            pady=(20, 10))

        rating_value = tk.IntVar(value=self.data["profiles"][profile_name].get("rating", 0))
        stars_row = tk.Frame(win, bg=BG)
        stars_row.pack(pady=(0, 20))
        star_labels = []

        def redraw_stars():
            for i, lbl in enumerate(star_labels):
                filled = i < rating_value.get()
                lbl.config(text="★" if filled else "☆", fg=GOLD if filled else SUBTEXT)

        def set_rating(i):
            rating_value.set(0 if rating_value.get() == i + 1 else i + 1)
            redraw_stars()

        for i in range(5):
            lbl = tk.Label(stars_row, text="☆", bg=BG, fg=SUBTEXT,
                            font=(FONT_FAMILY_UI, 24), cursor="hand2")
            lbl.pack(side="left", padx=2)
            lbl.bind("<Button-1>", lambda e, i=i: set_rating(i))
            star_labels.append(lbl)
        redraw_stars()

        def save_and_close():
            rating = rating_value.get()
            self.data["profiles"][profile_name]["rating"] = rating
            self._safe_save()
            write_log_file(self.data)
            self._refresh_profile_list()
            if self.selected == profile_name:
                self.canvas.itemconfig(self.rating_id, text=self._rating_stars(rating))
            win.destroy()

        self._make_button(win, tr("btn_save"), save_and_close, bg=self.accent, fg="#1e1e2e").pack(
            fill="x", padx=20, pady=(0, 18))

    def _set_status(self, status):
        """status is one of "in_progress", "completed", "dropped", "on_hold".
        Snapshots the tracked total at the moment of the change (separate from
        "seconds", which keeps counting if the game is played again) for
        anything other than "in_progress" — this is how a completion/drop/hold
        timestamp stays meaningful even after a post-status replay session."""
        if not self.selected:
            return
        if status != "in_progress" and self.selected in self.active_timers:
            self._pause_profile(self.selected)
        profile = self.data["profiles"][self.selected]
        if status == "in_progress":
            profile["status"] = "in_progress"
            profile["status_at"] = None
            profile["status_seconds"] = None
        else:
            profile["status"] = status
            profile["status_at"] = time.strftime("%Y-%m-%d")
            profile["status_seconds"] = profile.get("seconds", 0)
        self._safe_save()
        write_log_file(self.data)
        self._refresh_data_tab()
        self._refresh_profile_list()
        self._update_complete_toggle_visual()

    def _toggle_complete(self):
        """The Complete toggle is a simple on/off switch for the "completed"
        status specifically — flipping it is its own confirmation, the same
        way a phone settings toggle doesn't ask "are you sure?" before turning
        on Airplane Mode."""
        if not self.selected:
            return
        status = self.data["profiles"][self.selected].get("status", "in_progress")
        self._set_status("in_progress" if status == "completed" else "completed")

    def _duplicate_profile(self):
        if not self.selected:
            return
        self._checkpoint_one(self.selected)  # copy reflects the live count, original keeps running
        original = self.data["profiles"][self.selected]
        base_name = self.selected
        copy_word = tr("label_copy")
        new_name = f"{base_name} ({copy_word})"
        counter = 2
        while new_name in self.data["profiles"]:
            new_name = f"{base_name} ({copy_word} {counter})"
            counter += 1

        new_icon_file = None
        old_icon = original.get("icon_file")
        if old_icon:
            old_path = os.path.join(ICONS_DIR, old_icon)
            if os.path.exists(old_path):
                ext = os.path.splitext(old_icon)[1]
                new_icon_file = f"{uuid.uuid4().hex}{ext}"
                try:
                    shutil.copy(old_path, os.path.join(ICONS_DIR, new_icon_file))
                except Exception:
                    new_icon_file = None

        new_bg_image = None
        old_bg = original.get("bg_image")
        if old_bg:
            old_path = os.path.join(BACKGROUNDS_DIR, old_bg)
            if os.path.exists(old_path):
                ext = os.path.splitext(old_bg)[1]
                new_bg_image = f"{uuid.uuid4().hex}{ext}"
                try:
                    shutil.copy(old_path, os.path.join(BACKGROUNDS_DIR, new_bg_image))
                except Exception:
                    new_bg_image = None

        self.data["profiles"][new_name] = {
            "seconds": original.get("seconds", 0),
            "icon_file": new_icon_file,
            "bg_color": original.get("bg_color") if not new_bg_image else None,
            "bg_image": new_bg_image,
            "status": original.get("status", "in_progress"),
            "status_at": original.get("status_at"),
            "status_seconds": original.get("status_seconds"),
            "genres": list(original.get("genres", ["Uncategorized"])),
            "last_played": original.get("last_played"),
            "notes": original.get("notes", ""),
            "rating": original.get("rating", 0),
        }
        self._safe_save()
        write_log_file(self.data)
        self._refresh_profile_list()
        self._select_profile(new_name)

    def _set_profile_icon(self):
        if not self.selected:
            return
        if not PIL_AVAILABLE:
            messagebox.showerror(tr("err_missing_dep_title"), tr("err_missing_dep_icons_msg"))
            return
        path = filedialog.askopenfilename(
            title=tr("dlg_choose_image_title"),
            filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp *.gif *.webp")]
        )
        if not path:
            return
        os.makedirs(ICONS_DIR, exist_ok=True)
        ext = os.path.splitext(path)[1].lower() or ".png"
        fname = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(ICONS_DIR, fname)
        try:
            shutil.copy(path, dest)
        except Exception as e:
            messagebox.showerror(tr("err_set_icon_title"), str(e))
            return
        old = self.data["profiles"][self.selected].get("icon_file")
        if old:
            old_path = os.path.join(ICONS_DIR, old)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    pass
        self.data["profiles"][self.selected]["icon_file"] = fname
        self._safe_save()
        self._refresh_profile_list()

    # ---------- Export / Import ----------
    def _export_profile(self):
        if not self.selected:
            return
        self._checkpoint_one(self.selected)  # make sure "seconds" reflects the live session, not a stale value
        profile = self.data["profiles"][self.selected]
        export = {
            "name": self.selected,
            "seconds": profile.get("seconds", 0),
            "status": profile.get("status", "in_progress"),
            "status_at": profile.get("status_at"),
            "status_seconds": profile.get("status_seconds"),
            "genres": profile.get("genres", ["Uncategorized"]),
            "last_played": profile.get("last_played"),
            "notes": profile.get("notes", ""),
            "rating": profile.get("rating", 0),
        }
        icon_file = profile.get("icon_file")
        if icon_file:
            icon_path = os.path.join(ICONS_DIR, icon_file)
            if os.path.exists(icon_path):
                try:
                    with open(icon_path, "rb") as f:
                        export["icon_b64"] = base64.b64encode(f.read()).decode("ascii")
                    export["icon_ext"] = os.path.splitext(icon_file)[1]
                except Exception:
                    pass
        bg_image = profile.get("bg_image")
        if bg_image:
            bg_path = os.path.join(BACKGROUNDS_DIR, bg_image)
            if os.path.exists(bg_path):
                try:
                    with open(bg_path, "rb") as f:
                        export["bg_image_b64"] = base64.b64encode(f.read()).decode("ascii")
                    export["bg_image_ext"] = os.path.splitext(bg_image)[1]
                except Exception:
                    pass
        elif profile.get("bg_color"):
            export["bg_color"] = profile["bg_color"]
        os.makedirs(PROFILES_DIR, exist_ok=True)
        path = filedialog.asksaveasfilename(
            defaultextension=".gtprofile",
            initialdir=PROFILES_DIR,
            initialfile=f"{self.selected}.gtprofile",
            filetypes=[("Game Timer Profile", "*.gtprofile")]
        )
        if not path:
            return
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(export, f)
            messagebox.showinfo(tr("info_exported_title"), tr("info_exported_msg", path=path))
        except Exception as e:
            messagebox.showerror(tr("err_export_failed_title"), str(e))

    def _import_profile(self):
        os.makedirs(PROFILES_DIR, exist_ok=True)
        path = filedialog.askopenfilename(
            initialdir=PROFILES_DIR,
            filetypes=[("Game Timer Profile", "*.gtprofile"), ("All files", "*.*")]
        )
        if not path:
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                imported = json.load(f)
        except Exception as e:
            messagebox.showerror(tr("err_import_failed_title"), str(e))
            return

        name = imported.get("name", tr("default_imported_game_name"))
        original_name = name
        counter = 2
        while name in self.data["profiles"]:
            name = f"{original_name} ({counter})"
            counter += 1

        icon_file = None
        if imported.get("icon_b64"):
            try:
                os.makedirs(ICONS_DIR, exist_ok=True)
                ext = imported.get("icon_ext", ".png")
                icon_file = f"{uuid.uuid4().hex}{ext}"
                with open(os.path.join(ICONS_DIR, icon_file), "wb") as f:
                    f.write(base64.b64decode(imported["icon_b64"]))
            except Exception:
                icon_file = None

        bg_image_file = None
        if imported.get("bg_image_b64"):
            try:
                os.makedirs(BACKGROUNDS_DIR, exist_ok=True)
                ext = imported.get("bg_image_ext", ".png")
                bg_image_file = f"{uuid.uuid4().hex}{ext}"
                with open(os.path.join(BACKGROUNDS_DIR, bg_image_file), "wb") as f:
                    f.write(base64.b64decode(imported["bg_image_b64"]))
            except Exception:
                bg_image_file = None

        self.data["profiles"][name] = {
            "seconds": imported.get("seconds", 0), "icon_file": icon_file,
            "bg_color": imported.get("bg_color") if not bg_image_file else None,
            "bg_image": bg_image_file,
            "status": imported.get("status", "in_progress"),
            "status_at": imported.get("status_at"),
            "status_seconds": imported.get("status_seconds"),
            "genres": imported.get("genres") or ["Uncategorized"],
            "last_played": imported.get("last_played"),
            "notes": imported.get("notes", ""),
            "rating": imported.get("rating", 0),
        }
        self._safe_save()
        write_log_file(self.data)
        self._refresh_profile_list()
        self._select_profile(name)
        messagebox.showinfo(tr("info_imported_title"), tr("info_imported_msg", name=name))

    # ---------- Timer logic ----------
    # Any number of profiles can be actively running at once — self.active_timers
    # maps profile_name -> tick_start (time.time() when Play was pressed), and a
    # profile only appears in it while it's ticking. Selecting a different game
    # never touches other profiles' entries, so switching the visible timer no
    # longer pauses whatever else is running in the background.
    def _toggle_play(self):
        if not self.selected:
            return
        if self.selected in self.active_timers:
            self._pause_profile(self.selected)
        else:
            self._start_profile(self.selected)

    def _start_profile(self, name):
        if name not in self.data["profiles"]:
            return
        profile = self.data["profiles"][name]
        if profile.get("status") in ("dropped", "on_hold"):
            # Pressing Play is the natural "I'm actually playing this again"
            # signal — Completed survives replay (see _mark_completed's
            # comment), but a stale Dropped/On Hold label doesn't.
            profile["status"] = "in_progress"
            profile["status_at"] = None
            profile["status_seconds"] = None
        self.active_timers[name] = time.time()
        profile["last_played"] = time.time()
        self._safe_save()
        if name == self.selected:
            self._set_play_button_state()
        self._refresh_profile_list()

    def _pause_profile(self, name):
        tick_start = self.active_timers.pop(name, None)
        if tick_start is not None:
            try:
                elapsed = time.time() - tick_start
                if name in self.data["profiles"]:
                    self.data["profiles"][name]["seconds"] += elapsed
                save_data(self.data)
                write_log_file(self.data)
            except Exception:
                pass  # never let a save/log failure block pausing or closing
        if name == self.selected:
            self._set_play_button_state()
            self._update_timer_display()
        self._refresh_profile_list()

    def _checkpoint_all(self):
        """Periodic autosave for every concurrently running timer, without
        stopping any of them — called from the tick loop."""
        now = time.time()
        touched = False
        for name in list(self.active_timers.keys()):
            if name not in self.data["profiles"]:
                del self.active_timers[name]
                continue
            elapsed = now - self.active_timers[name]
            self.data["profiles"][name]["seconds"] += elapsed
            self.active_timers[name] = now
            touched = True
        if touched:
            try:
                save_data(self.data)
            except Exception:
                pass

    def _checkpoint_one(self, name):
        """Commits a running profile's elapsed time so far without stopping
        it — used before reading "seconds" for Duplicate/Export so the copy
        reflects the live count instead of a stale pre-session value."""
        if name in self.active_timers:
            now = time.time()
            elapsed = now - self.active_timers[name]
            if name in self.data["profiles"]:
                self.data["profiles"][name]["seconds"] += elapsed
            self.active_timers[name] = now

    def _set_play_button_state(self):
        running = bool(self.selected and self.selected in self.active_timers)
        if running:
            self.play_button.config(text=tr("btn_pause"), bg=RED, activebackground=RED)
            self._add_hover(self.play_button, RED)
            self.canvas.itemconfig(self.status_id, text=tr("status_tracking"), fill=GREEN)
        else:
            self.play_button.config(text=tr("btn_play"), bg=GREEN, activebackground=GREEN)
            self._add_hover(self.play_button, GREEN)
            self.canvas.itemconfig(self.status_id, text=tr("status_paused") if self.selected else "", fill=SUBTEXT)
        self._update_tray_status()

    def _current_total_seconds(self):
        if not self.selected:
            return 0
        base = self.data["profiles"][self.selected]["seconds"]
        if self.selected in self.active_timers:
            base += time.time() - self.active_timers[self.selected]
        return base

    def _update_timer_display(self):
        self.canvas.itemconfig(self.timer_id, text=format_seconds(self._current_total_seconds()))

    def _tick(self):
        if self.selected:
            self._update_timer_display()
        if self.active_timers and time.time() - self.last_autosave >= self.autosave_interval:
            self._checkpoint_all()
            self.last_autosave = time.time()
        if self.active_timers and time.time() - self.last_log_write >= self.log_interval:
            write_log_file(self.data)
            self.last_log_write = time.time()
        today = time.strftime("%Y-%m-%d")
        if today != self.last_backup_day:
            backup_data_file()
            self.last_backup_day = today
        self.root.after(500, self._tick)

    # ---------- Settings (tabbed) ----------
    def _open_settings(self):
        win = tk.Toplevel(self.root)
        win.title(tr("settings_title"))
        win.configure(bg=BG)
        self._center_window(win, 460, 560)
        win.minsize(440, 480)
        win.transient(self.root)
        win.grab_set()

        notebook = ttk.Notebook(win)
        notebook.pack(fill="both", expand=True, padx=10, pady=10)

        tab_general = tk.Frame(notebook, bg=BG)
        tab_tray = tk.Frame(notebook, bg=BG)
        tab_appearance_outer = tk.Frame(notebook, bg=BG)
        tab_language = tk.Frame(notebook, bg=BG)
        notebook.add(tab_general, text=tr("tab_general"))
        notebook.add(tab_tray, text=tr("tab_tray"))
        notebook.add(tab_appearance_outer, text=tr("tab_appearance"))
        notebook.add(tab_language, text=tr("tab_language"))

        # --- General tab ---
        startup_var = tk.BooleanVar(value=self.data["settings"].get("run_at_startup", False))
        tk.Label(tab_general, text=tr("label_startup"), bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(18, 6))
        tk.Checkbutton(
            tab_general, text=tr("chk_launch_at_startup"),
            variable=startup_var, bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
            activeforeground=TEXT, font=FONT_MAIN, anchor="w", highlightthickness=0, bd=0
        ).pack(fill="x", padx=16)
        if not getattr(sys, "frozen", False):
            tk.Label(tab_general, text=tr("note_startup_exe_only"),
                     bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(2, 0))

        # --- Tray tab ---
        tray_var = tk.BooleanVar(value=self.data["settings"].get("tray_enabled", True))
        tk.Label(tab_tray, text=tr("label_system_tray"), bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(18, 6))
        tray_chk = tk.Checkbutton(
            tab_tray, text=tr("chk_enable_tray"),
            variable=tray_var, bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
            activeforeground=TEXT, font=FONT_MAIN, anchor="w", highlightthickness=0, bd=0
        )
        tray_chk.pack(fill="x", padx=16)
        tk.Label(tab_tray,
                 text=tr("note_tray_behavior"),
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL, justify="left").pack(anchor="w", padx=16, pady=(10, 0))
        if not TRAY_AVAILABLE:
            tk.Label(tab_tray, text=tr("note_tray_requires"),
                     bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(8, 0))
            tray_chk.config(state="disabled")

        # --- Language tab ---
        tk.Label(tab_language, text=tr("label_language"), bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(18, 6))
        tk.Label(tab_language, text=tr("note_choose_language"), bg=BG, fg=SUBTEXT, font=FONT_SMALL,
                 wraplength=380, justify="left").pack(anchor="w", padx=16, pady=(0, 10))
        language_var = tk.StringVar(value=self.data["settings"].get("language", "en"))
        for code in LANGUAGE_ORDER:
            tk.Radiobutton(
                tab_language, text=LANGUAGE_NAMES[code], variable=language_var, value=code,
                bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
                activeforeground=TEXT, font=FONT_MAIN, anchor="w", highlightthickness=0, bd=0
            ).pack(anchor="w", padx=16, pady=2)

        # --- Appearance tab (scrollable — a lot lives here) ---
        appearance_canvas = tk.Canvas(tab_appearance_outer, bg=BG, highlightthickness=0)
        appearance_scrollbar = ttk.Scrollbar(tab_appearance_outer, orient="vertical",
                                              command=appearance_canvas.yview)
        tab_appearance = tk.Frame(appearance_canvas, bg=BG)
        tab_appearance.bind("<Configure>",
                             lambda e: appearance_canvas.configure(scrollregion=appearance_canvas.bbox("all")))
        appearance_canvas.create_window((0, 0), window=tab_appearance, anchor="nw", width=420)
        appearance_canvas.configure(yscrollcommand=appearance_scrollbar.set)
        appearance_canvas.pack(side="left", fill="both", expand=True)
        appearance_scrollbar.pack(side="right", fill="y")
        self._bind_mousewheel(win, appearance_canvas)

        # Theme presets
        tk.Label(tab_appearance, text=tr("label_theme"), bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(18, 6))
        theme_var = tk.StringVar(value=self.data["settings"].get("theme", "Midnight Blue"))
        for theme_name in THEME_ORDER:
            if theme_name == "Custom":
                continue
            palette = THEMES[theme_name]
            row = tk.Frame(tab_appearance, bg=BG)
            row.pack(fill="x", padx=16, pady=2)
            tk.Label(row, text="  ", bg=palette["accent"]).pack(side="left", padx=(0, 8))
            tk.Radiobutton(
                row, text=theme_name, variable=theme_var, value=theme_name,
                bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
                activeforeground=TEXT, font=FONT_MAIN, anchor="w", highlightthickness=0, bd=0
            ).pack(side="left")
        custom_row = tk.Frame(tab_appearance, bg=BG)
        custom_row.pack(fill="x", padx=16, pady=2)
        custom_colors_ref = dict(self.data["settings"].get("custom_colors", DEFAULT_CUSTOM_COLORS))
        tk.Label(custom_row, text="  ", bg=custom_colors_ref.get("accent", ACCENT_DEFAULT)).pack(
            side="left", padx=(0, 8))
        tk.Radiobutton(
            custom_row, text="Custom", variable=theme_var, value="Custom",
            bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
            activeforeground=TEXT, font=FONT_MAIN, anchor="w", highlightthickness=0, bd=0
        ).pack(side="left")

        def open_customizer():
            base = custom_colors_ref if theme_var.get() == "Custom" else THEMES.get(theme_var.get(), THEMES["Midnight Blue"])
            self._open_color_customizer(win, base, custom_colors_ref, theme_var)

        self._make_button(tab_appearance, tr("btn_customize_colors"), open_customizer, bg=CARD, fg=TEXT).pack(
            anchor="w", padx=16, pady=(8, 4))
        tk.Label(tab_appearance, text=tr("note_applies_on_save"),
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(0, 4))

        # Accent override (fine-tune on top of whichever theme is active)
        tk.Label(tab_appearance, text=tr("label_accent_color"), bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(16, 6))
        color_row = tk.Frame(tab_appearance, bg=BG)
        color_row.pack(fill="x", padx=16)
        swatch = tk.Label(color_row, text="     ", bg=self.data["settings"].get("accent", ACCENT_DEFAULT))
        swatch.pack(side="left", padx=(0, 8))

        def pick_color():
            c = colorchooser.askcolor(color=self.data["settings"].get("accent", ACCENT_DEFAULT),
                                       parent=win, title=tr("label_accent_color"))
            if c and c[1]:
                self.data["settings"]["accent"] = c[1]
                swatch.config(bg=c[1])

        self._make_button(color_row, tr("btn_change"), pick_color, bg=CARD, fg=TEXT, width=8).pack(side="left")
        tk.Label(tab_appearance, text=tr("note_applies_on_save"),
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(4, 0))

        # Icon size
        tk.Label(tab_appearance, text=tr("label_icon_size"), bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(20, 6))
        size_key_to_label = {"Small": tr("size_small"), "Medium": tr("size_medium"),
                              "Large": tr("size_large"), "Extra Large": tr("size_xl")}
        current_label = next((k for k, v in ICON_SIZE_OPTIONS.items() if v == self.icon_size), "Medium")
        icon_size_var = tk.StringVar(value=current_label)
        size_row = tk.Frame(tab_appearance, bg=BG)
        size_row.pack(fill="x", padx=16)
        for size_key in ICON_SIZE_OPTIONS:
            tk.Radiobutton(
                size_row, text=size_key_to_label[size_key], variable=icon_size_var, value=size_key,
                bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
                activeforeground=TEXT, font=FONT_SMALL, highlightthickness=0, bd=0
            ).pack(anchor="w")
        tk.Label(tab_appearance, text=tr("note_applies_immediately"),
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(4, 0))

        # Font
        tk.Label(tab_appearance, text=tr("label_font"), bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(20, 6))
        font_var = tk.StringVar(value=self.data["settings"].get("font_family", "Segoe UI"))
        font_menu = tk.OptionMenu(tab_appearance, font_var, *FONT_CHOICES)
        font_menu.config(bg=CARD, fg=TEXT, activebackground=CARD, activeforeground=TEXT,
                         bd=0, highlightthickness=0, font=FONT_MAIN, width=16)
        font_menu["menu"].config(bg=CARD, fg=TEXT)
        font_menu.pack(anchor="w", padx=16)
        tk.Label(tab_appearance, text=tr("note_font_timer"),
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL, justify="left").pack(anchor="w", padx=16, pady=(4, 16))

        def save_and_close():
            self.data["settings"]["tray_enabled"] = tray_var.get()
            wanted_startup = startup_var.get()
            self.data["settings"]["run_at_startup"] = wanted_startup
            self.data["settings"]["icon_size"] = ICON_SIZE_OPTIONS[icon_size_var.get()]
            self.data["settings"]["theme"] = theme_var.get()
            self.data["settings"]["custom_colors"] = custom_colors_ref
            self.data["settings"]["font_family"] = font_var.get()
            self.data["settings"]["language"] = language_var.get()
            self._safe_save()

            if getattr(sys, "frozen", False) and WINREG_AVAILABLE:
                try:
                    set_startup(wanted_startup)
                except Exception as e:
                    messagebox.showerror(tr("err_startup_failed_title"), str(e))

            win.destroy()
            self._apply_appearance_and_rebuild()

        settings_bottom_bar = tk.Frame(win, bg=BG)
        settings_bottom_bar.pack(side="bottom", fill="x")
        self._make_button(settings_bottom_bar, tr("btn_save"), save_and_close, bg=self.accent, fg="#1e1e2e").pack(
            side="left", expand=True, fill="x", padx=(10, 0), pady=(10, 4))
        ttk.Sizegrip(settings_bottom_bar).pack(side="right", anchor="se", padx=(4, 4), pady=(10, 4))

    def _apply_appearance_and_rebuild(self):
        """Re-applies theme/font/accent/icon-size from settings and rebuilds the
        whole UI in place, so appearance changes show up instantly instead of
        requiring the app to be restarted."""
        theme_name = self.data["settings"].get("theme", "Midnight Blue")
        if theme_name == "Custom":
            apply_theme_globals(self.data["settings"].get("custom_colors", DEFAULT_CUSTOM_COLORS))
        else:
            apply_theme_globals(THEMES.get(theme_name, THEMES["Midnight Blue"]))
        apply_font_globals(self.data["settings"].get("font_family", "Segoe UI"))
        apply_language_global(self.data["settings"].get("language", "en"))
        self.accent = self.data["settings"].get("accent", ACCENT_DEFAULT)
        self.icon_size = self.data["settings"].get("icon_size", 36)
        self._apply_tray_setting()
        self._rebuild_ui()

    def _rebuild_ui(self):
        """Tears down and rebuilds the entire window in place — used after an
        appearance change so it applies instantly without a restart. Running
        timers live in self.active_timers, not in any widget, so they keep
        ticking through the rebuild without needing to be paused/restarted."""
        selected_before = self.selected

        for child in self.root.winfo_children():
            child.destroy()

        self.root.configure(bg=BG)
        self._build_ui()
        self._refresh_profile_list()

        if selected_before and selected_before in self.data["profiles"]:
            self._select_profile(selected_before)
        else:
            self._set_play_button_state()
            self._update_complete_toggle_visual()
            self._render_background()

        self._update_tray_status()

    def _open_color_customizer(self, parent_win, base_colors, custom_colors_ref, theme_var):
        editor = tk.Toplevel(parent_win)
        editor.title(tr("dlg_customize_colors_title"))
        editor.configure(bg=BG)
        self._center_window(editor, 340, 420, parent=parent_win)
        editor.resizable(False, False)
        editor.transient(parent_win)
        editor.grab_set()

        working = dict(base_colors)
        roles = [
            ("bg", tr("role_background")), ("panel", tr("role_panel")), ("card", tr("role_cards")),
            ("text", tr("role_text")), ("subtext", tr("role_subtext")), ("accent", tr("role_accent")),
        ]
        tk.Label(editor, text=tr("dlg_customize_colors_desc"), bg=BG, fg=TEXT,
                 font=FONT_MAIN, wraplength=300).pack(pady=(16, 10))

        for key, label in roles:
            row = tk.Frame(editor, bg=BG)
            row.pack(fill="x", padx=16, pady=4)
            tk.Label(row, text=label, bg=BG, fg=TEXT, font=FONT_SMALL, width=15, anchor="w").pack(side="left")
            sw = tk.Label(row, text="   ", bg=working.get(key, "#000000"))
            sw.pack(side="left", padx=8)

            def make_picker(k=key, swatch_label=sw):
                def picker():
                    c = colorchooser.askcolor(color=working.get(k), parent=editor, title=f"Choose {k} color")
                    if c and c[1]:
                        working[k] = c[1]
                        swatch_label.config(bg=c[1])
                return picker

            self._make_button(row, tr("btn_change"), make_picker(), bg=CARD, fg=TEXT, width=8).pack(side="left")

        def use_these_colors():
            custom_colors_ref.clear()
            custom_colors_ref.update(working)
            theme_var.set("Custom")
            editor.destroy()

        self._make_button(editor, tr("btn_use_these_colors"), use_these_colors,
                           bg=working.get("accent", ACCENT_DEFAULT), fg="#1e1e2e").pack(pady=16)

    # ---------- System tray ----------
    def _apply_tray_setting(self):
        enabled = self.data["settings"].get("tray_enabled", True) and TRAY_AVAILABLE
        if enabled and self.tray_icon is None:
            self._start_tray()
        elif not enabled and self.tray_icon is not None:
            self._stop_tray()

    def _start_tray(self):
        color = GREEN_RGBA if self.active_timers else RED_RGBA
        image = make_tray_image(color)
        menu = pystray.Menu(
            pystray.MenuItem(lambda item: tr("tray_menu_show"), lambda: self.root.after(0, self._show_window), default=True),
            pystray.MenuItem(lambda item: tr("tray_menu_pause") if (self.selected in self.active_timers) else tr("tray_menu_play"),
                              lambda: self.root.after(0, self._toggle_play)),
            pystray.MenuItem(lambda item: tr("tray_quit"), lambda: self.root.after(0, self._quit_app)),
        )
        self.tray_icon = pystray.Icon("GameTimer", image, "Game Timer", menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def _stop_tray(self):
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except Exception:
                pass
            self.tray_icon = None

    def _update_tray_status(self):
        if self.tray_icon:
            running_count = len(self.active_timers)
            color = GREEN_RGBA if running_count else RED_RGBA
            try:
                self.tray_icon.icon = make_tray_image(color)
                if running_count > 1:
                    status = tr("tray_status_tracking_count", count=running_count)
                elif self.selected in self.active_timers:
                    status = tr("tray_status_tracking")
                else:
                    status = tr("tray_status_paused")
                self.tray_icon.title = f"Game Timer \u2014 {self.selected or tr('canvas_no_profile_selected')} ({status})"
            except Exception:
                pass

    def _show_window(self):
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()

    # ---------- Close / quit ----------
    def _on_close(self):
        try:
            if (self.data["settings"].get("tray_enabled", True) and TRAY_AVAILABLE
                    and self.tray_icon is not None):
                self.root.withdraw()
                return
        except Exception:
            pass  # if anything about the tray check fails, fall through to a real quit
        self._quit_app()

    def _quit_app(self):
        # Every step here is best-effort — a failure in any one of them (disk
        # full, file locked by antivirus, etc.) must never prevent the window
        # from actually closing.
        try:
            for name in list(self.active_timers.keys()):
                self._pause_profile(name)
        except Exception:
            pass
        try:
            save_data(self.data)
        except Exception:
            pass
        try:
            write_log_file(self.data)
        except Exception:
            pass
        try:
            self._stop_tray()
        except Exception:
            pass
        self.root.destroy()


if __name__ == "__main__":
    if not acquire_single_instance():
        _data_for_lang = load_data()
        apply_language_global(_data_for_lang["settings"].get("language", "en"))
        _tmp = tk.Tk()
        _tmp.withdraw()
        messagebox.showwarning(tr("err_already_running_title"), tr("err_already_running_msg"))
        _tmp.destroy()
        sys.exit(0)

    root = tk.Tk()
    app = GameTimerApp(root)
    root.mainloop()
