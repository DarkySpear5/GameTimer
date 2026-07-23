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

GENRE_OPTIONS = [
    "Uncategorized", "Action", "Adventure", "RPG", "Strategy", "Simulation",
    "Sports", "Racing", "Puzzle", "Platformer", "Shooter", "Fighting",
    "Horror", "Survival", "Open World", "MMO", "Visual Novel", "Rhythm",
    "Card / Board Game", "Party", "Roguelike", "Other",
]


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
    for p in data["profiles"].values():
        p.setdefault("icon_file", None)
        p.setdefault("bg_color", None)
        p.setdefault("bg_image", None)
        p.setdefault("completed", False)
        p.setdefault("completed_at", None)
        p.setdefault("last_played", None)
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
        completed = [n for n, p in data["profiles"].items() if p.get("completed")]
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
        for name, info in data["profiles"].items():
            status = "Completed" if info.get("completed") else "In Progress"
            completed_on = f" ({info['completed_at']})" if info.get("completed_at") else ""
            genre = ", ".join(info.get("genres", ["Uncategorized"]))
            lines.append(
                f"  {name.ljust(name_width)} {format_seconds(info.get('seconds', 0)).rjust(14)}  "
                f"{status}{completed_on}  [{genre}]"
            )
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception:
        pass  # logging must never crash the app


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

        self.accent = self.data["settings"].get("accent", ACCENT_DEFAULT)
        self.icon_size = self.data["settings"].get("icon_size", 36)
        self.sort_mode = self.data["settings"].get("sort_mode", "name")
        self.genre_filter = self.data["settings"].get("genre_filter", "All")

        self.running = False
        self.tick_start = None
        self.selected = None
        self.last_autosave = None
        self.autosave_interval = 5
        self.last_log_write = time.time()
        self.log_interval = 60
        self.thumb_refs = {}
        self.data_thumb_refs = {}
        self.tray_icon = None
        self.bg_photo = None
        self.bg_image_id = None
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
        self.main_notebook.add(timer_tab, text="Game Timer")
        self.main_notebook.add(data_tab, text="Data")
        self.main_notebook.add(about_tab, text="About")
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
        hint_label = tk.Label(left, text="Right-click a game for more options",
                               bg=PANEL, fg=SUBTEXT, font=FONT_SMALL, wraplength=200)
        hint_label.pack(side="bottom", padx=12, pady=(0, 10))

        btn_frame = tk.Frame(left, bg=PANEL)
        btn_frame.pack(side="bottom", fill="x", padx=10, pady=10)
        self._make_button(btn_frame, "+ Add Game", self._new_profile,
                           bg=self.accent, fg="#1e1e2e").pack(fill="x", pady=2)

        top_row = tk.Frame(left, bg=PANEL)
        top_row.pack(side="top", fill="x", padx=16, pady=(16, 4))
        tk.Label(top_row, text="GAMES", bg=PANEL, fg=SUBTEXT,
                 font=FONT_SMALL).pack(side="left")

        sort_filter_row = tk.Frame(left, bg=PANEL)
        sort_filter_row.pack(side="top", fill="x", padx=10, pady=(0, 6))
        self._make_button(sort_filter_row, "Sort \u25be", self._open_sort_menu, bg=CARD, fg=TEXT,
                           width=9, font=FONT_SMALL).pack(side="left", expand=True, fill="x", padx=(0, 3))
        self._make_button(sort_filter_row, "Filter \u25be", self._open_filter_menu, bg=CARD, fg=TEXT,
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
            0, 0, text="No profile selected", fill=TEXT,
            font=(FONT_FAMILY_UI, FONT_TITLE_BASE, "bold"), anchor="center"
        )
        self.status_id = self.canvas.create_text(
            0, 0, text="", fill=SUBTEXT, font=FONT_SMALL, anchor="center"
        )
        self.timer_id = self.canvas.create_text(
            0, 0, text="00:00:00", fill=TEXT,
            font=("Consolas", FONT_TIMER_BASE, "bold"), anchor="center"
        )

        self.play_button = tk.Button(
            self.canvas, text="\u25b6  Play", command=self._toggle_play, bg=GREEN, fg="#1e1e2e",
            activebackground=GREEN, activeforeground="#1e1e2e", bd=0, relief="flat",
            highlightthickness=0, font=(FONT_FAMILY_UI, 13, "bold"), width=12, padx=6, pady=8, cursor="hand2"
        )
        self.complete_button = tk.Button(
            self.canvas, text="\u2713 Complete", command=self._complete_profile, bg=GOLD, fg="#1e1e2e",
            activebackground=GOLD, activeforeground="#1e1e2e", bd=0, relief="flat",
            highlightthickness=0, font=FONT_MAIN, width=11, padx=6, pady=8, cursor="hand2"
        )
        self._add_hover(self.play_button, GREEN)
        self._add_hover(self.complete_button, GOLD)
        self.play_window_id = self.canvas.create_window(0, 0, window=self.play_button)
        self.reset_window_id = self.canvas.create_window(0, 0, window=self.complete_button)

        self.hint_id = self.canvas.create_text(
            0, 0, text="Right-click a game in the list for more options",
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
        tab_text = self.main_notebook.tab(self.main_notebook.select(), "text")
        if tab_text == "Data":
            self._refresh_data_tab()

    def _build_data_tab(self, parent):
        tk.Label(parent, text="Your Stats", bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 18, "bold")).pack(anchor="w", padx=24, pady=(22, 12))

        stats_row = tk.Frame(parent, bg=BG)
        stats_row.pack(fill="x", padx=24, pady=(0, 18))

        self.stat_total_time_label = self._make_stat_card(stats_row, "Total Time Played", "00:00:00")
        self.stat_games_tracked_label = self._make_stat_card(stats_row, "Games Tracked", "0")
        self.stat_completed_label = self._make_stat_card(stats_row, "Games Completed", "0")

        table_frame = tk.Frame(parent, bg=BG)
        table_frame.pack(fill="both", expand=True, padx=24, pady=(0, 20))

        columns = ("time", "status", "completed_on", "genres")
        self.data_tree = ttk.Treeview(table_frame, columns=columns, show="tree headings",
                                       selectmode="browse")
        self.data_tree.heading("#0", text="Game")
        self.data_tree.heading("time", text="Time Played")
        self.data_tree.heading("status", text="Status")
        self.data_tree.heading("completed_on", text="Completed On")
        self.data_tree.heading("genres", text="Genres")
        self.data_tree.column("#0", width=220)
        self.data_tree.column("time", width=120, anchor="center")
        self.data_tree.column("status", width=100, anchor="center")
        self.data_tree.column("completed_on", width=120, anchor="center")
        self.data_tree.column("genres", width=160, anchor="center")

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
        tk.Label(inner, text="v1.0 — a small, offline, manual play/pause game time tracker.",
                 bg=BG, fg=SUBTEXT, font=FONT_MAIN).pack(anchor="w", padx=24, pady=(0, 20))

        tk.Label(inner, text="Built With", bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 13, "bold")).pack(anchor="w", padx=24, pady=(0, 8))

        third_party = [
            ("Python", "The language this app is written in.", "Python Software Foundation License"),
            ("Tkinter", "The UI toolkit used for every window and widget.", "Bundled with Python, same license"),
            ("Pillow (PIL)", "Loads and resizes profile icons and backgrounds.", "HPND License"),
            ("pystray", "Powers the system tray icon and status dot.", "LGPL v3"),
            ("PyInstaller", "Packages this app into a standalone .exe.", "GPL-licensed bootloader; doesn't license your own script"),
            ("Inno Setup", "Builds the Windows installer.", "Free for any use, including commercial"),
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

        tk.Label(inner, text="License details are as commonly published by each project; check their "
                              "official pages for the full, current text.",
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL, wraplength=520, justify="left").pack(
            anchor="w", padx=24, pady=(8, 20))

        tk.Label(inner, text="Contact", bg=BG, fg=TEXT,
                 font=(FONT_FAMILY_UI, 13, "bold")).pack(anchor="w", padx=24, pady=(0, 8))
        contact_card = tk.Frame(inner, bg=CARD)
        contact_card.pack(fill="x", padx=24, pady=(0, 30))
        tk.Label(contact_card, text="Discord", bg=CARD, fg=self.accent,
                 font=(FONT_FAMILY_UI, 11, "bold")).pack(anchor="w", padx=14, pady=(10, 0))
        tk.Label(contact_card, text="rawwwwwrr", bg=CARD, fg=TEXT, font=FONT_MAIN).pack(
            anchor="w", padx=14, pady=(2, 12))

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
            if info.get("completed"):
                completed_count += 1

        self.stat_total_time_label.config(text=format_seconds(total_seconds))
        self.stat_games_tracked_label.config(text=str(len(self.data["profiles"])))
        self.stat_completed_label.config(text=str(completed_count))

        self.data_tree.delete(*self.data_tree.get_children())
        self.data_thumb_refs = {}
        for i, (name, info) in enumerate(self.data["profiles"].items()):
            status = "Completed" if info.get("completed") else "In Progress"
            completed_on = info.get("completed_at") or "\u2014"
            row_tag = "rowA" if i % 2 == 0 else "rowB"

            icon_file = info.get("icon_file")
            img = None
            if icon_file:
                path = os.path.join(ICONS_DIR, icon_file)
                if os.path.exists(path):
                    img = self._load_thumbnail(path, size=(24, 24))

            kwargs = dict(
                text=" " + name,
                values=(format_seconds(info.get("seconds", 0)), status, completed_on,
                        ", ".join(info.get("genres", ["Uncategorized"]))),
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
            messagebox.showerror(
                "Couldn't save",
                "Game Timer couldn't save your data.\n\n"
                f"Reason: {e}\n\n"
                "This usually means the folder it's installed in isn't writable "
                "by your account — most commonly because it's installed inside "
                "Program Files. Try reinstalling to a normal user folder (the "
                "installer's suggested default, or somewhere like Documents), "
                "or run Game Timer as Administrator."
            )
            return False

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
        self.canvas.coords(self.timer_id, cx, int(h * 0.45))
        self.canvas.itemconfig(self.timer_id, font=timer_font)

        btn_y = int(h * 0.68)
        gap = max(70, int(70 * scale * 0.6))
        self.canvas.coords(self.play_window_id, cx - gap, btn_y)
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
                    img = Image.open(path).convert("RGB")
                    img = ImageOps.fit(img, (w, h), Image.LANCZOS)
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

    def _get_sorted_filtered_profiles(self):
        items = list(self.data["profiles"].items())
        if self.genre_filter != "All":
            items = [(n, i) for n, i in items if self.genre_filter in i.get("genres", ["Uncategorized"])]
        if self.sort_mode == "last_played":
            items.sort(key=lambda x: x[1].get("last_played") or 0, reverse=True)
        elif self.sort_mode == "genre":
            items.sort(key=lambda x: (", ".join(x[1].get("genres", ["Uncategorized"])), x[0].lower()))
        else:  # "name"
            items.sort(key=lambda x: x[0].lower())
        return items

    def _refresh_profile_list(self):
        self.tree.delete(*self.tree.get_children())
        self.thumb_refs = {}
        for name, info in self._get_sorted_filtered_profiles():
            icon_file = info.get("icon_file")
            img = None
            if icon_file:
                path = os.path.join(ICONS_DIR, icon_file)
                if os.path.exists(path):
                    img = self._load_thumbnail(path)
            if img:
                self.thumb_refs[name] = img
                self.tree.insert("", "end", iid=name, text=" " + name, image=img)
            else:
                self.tree.insert("", "end", iid=name, text=" " + name)
        self._highlight_selected()

    def _highlight_selected(self):
        if self.selected and self.tree.exists(self.selected):
            self.tree.selection_set(self.selected)
            self.tree.see(self.selected)

    def _on_tree_select(self, event):
        sel = self.tree.selection()
        if not sel:
            return
        name = sel[0]
        if name != self.selected:
            self._select_profile(name)

    def _select_profile(self, name):
        if self.running:
            self._pause_current()
        self.selected = name
        self.data["last_selected"] = name
        self._safe_save()
        self.canvas.itemconfig(self.title_id, text=name)
        self._update_timer_display()
        self._highlight_selected()
        self._update_tray_status()
        self._render_background()

    # ---------- Sort / Filter ----------
    def _open_sort_menu(self):
        menu = tk.Menu(self.root, tearoff=0, bg=CARD, fg=TEXT,
                        activebackground=self.accent, activeforeground="#1e1e2e")
        options = [("name", "Name (A-Z)"), ("last_played", "Last Played (Recent first)"),
                   ("genre", "Genre (A-Z)")]
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
            menu.add_command(label=prefix + genre, command=lambda g=genre: self._set_genre_filter(g))
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

    def _open_genre_picker(self):
        if not self.selected:
            return
        profile_name = self.selected
        win = tk.Toplevel(self.root)
        win.title("Select Genres")
        win.configure(bg=BG)
        win.geometry("300x460")
        win.transient(self.root)
        win.grab_set()

        tk.Label(win, text=f"Genres for '{profile_name}'", bg=BG, fg=TEXT,
                 font=FONT_MAIN, wraplength=260).pack(pady=(16, 2))
        tk.Label(win, text="Click to select any number of genres.", bg=BG, fg=SUBTEXT,
                 font=FONT_SMALL).pack(pady=(0, 10))

        list_frame = tk.Frame(win, bg=BG)
        list_frame.pack(fill="both", expand=True, padx=16, pady=(0, 12))
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
            listbox.insert("end", genre)
            if genre in current_genres:
                listbox.selection_set(i)

        def assign_and_close():
            sel = listbox.curselection()
            genres = [listbox.get(i) for i in sel] or ["Uncategorized"]
            self.data["profiles"][profile_name]["genres"] = genres
            self._safe_save()
            write_log_file(self.data)
            self._refresh_profile_list()
            win.destroy()

        self._make_button(win, "Assign", assign_and_close, bg=self.accent, fg="#1e1e2e").pack(
            fill="x", padx=16, pady=(0, 16))

    # ---------- Context menu ----------
    def _show_context_menu(self, event):
        iid = self.tree.identify_row(event.y)
        menu = tk.Menu(self.root, tearoff=0, bg=CARD, fg=TEXT,
                        activebackground=self.accent, activeforeground="#1e1e2e")
        if iid:
            self.tree.selection_set(iid)
            self._select_profile(iid)
            menu.add_command(label="Rename", command=self._rename_profile)
            menu.add_command(label="Reset Time", command=self._reset_time)
            menu.add_command(label="Change Icon", command=self._set_profile_icon)
            menu.add_command(label="Change Background", command=self._set_profile_background)
            menu.add_command(label="Select Genres", command=self._open_genre_picker)
            menu.add_separator()
            menu.add_command(label="Export", command=self._export_profile)
            menu.add_command(label="Import", command=self._import_profile)
            menu.add_separator()
            menu.add_command(label="Delete", command=self._delete_profile)
        else:
            menu.add_command(label="Add Game", command=self._new_profile)
            menu.add_command(label="Import", command=self._import_profile)
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    # ---------- Profile CRUD ----------
    def _new_profile(self):
        name = simpledialog.askstring("Add Game", "Game name:", parent=self.root)
        if not name:
            return
        name = name.strip()
        if not name:
            return
        if name in self.data["profiles"]:
            messagebox.showwarning("Already exists", "A profile with that name already exists.")
            return
        self.data["profiles"][name] = {"seconds": 0, "icon_file": None, "bg_color": None, "bg_image": None,
                                        "completed": False, "completed_at": None,
                                        "genres": ["Uncategorized"], "last_played": None}
        self._safe_save()
        write_log_file(self.data)
        self._refresh_profile_list()
        self._select_profile(name)

    def _rename_profile(self):
        if not self.selected:
            return
        new_name = simpledialog.askstring("Rename Profile", "New name:",
                                           initialvalue=self.selected, parent=self.root)
        if not new_name:
            return
        new_name = new_name.strip()
        if not new_name or new_name == self.selected:
            return
        if new_name in self.data["profiles"]:
            messagebox.showwarning("Already exists", "A profile with that name already exists.")
            return
        was_running = self.running
        if was_running:
            self._pause_current()
        self.data["profiles"][new_name] = self.data["profiles"].pop(self.selected)
        self.selected = new_name
        self.data["last_selected"] = new_name
        self._safe_save()
        write_log_file(self.data)
        self._refresh_profile_list()
        self.canvas.itemconfig(self.title_id, text=new_name)
        if was_running:
            self._start_current()

    def _delete_profile(self):
        if not self.selected:
            return
        if not messagebox.askyesno("Delete profile",
                                    f"Delete '{self.selected}' and its tracked time? This cannot be undone."):
            return
        if self.running:
            self.running = False
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
        self.canvas.itemconfig(self.title_id, text="No profile selected")
        self.canvas.itemconfig(self.timer_id, text="00:00:00")
        self._set_play_button_state()
        self._render_background()

    def _reset_time(self):
        if not self.selected:
            return
        if not messagebox.askyesno("Reset time", f"Reset tracked time for '{self.selected}' to zero?"):
            return
        if self.running:
            self._pause_current()
        self.data["profiles"][self.selected]["seconds"] = 0
        self._safe_save()
        self._update_timer_display()

    def _complete_profile(self):
        if not self.selected:
            return
        if self.running:
            self._pause_current()
        profile = self.data["profiles"][self.selected]
        already = profile.get("completed", False)
        if already:
            prompt = f"'{self.selected}' is already marked completed.\nUpdate the completion date to today?"
        else:
            prompt = f"Mark '{self.selected}' as completed?\nThe timer will stop and this will show up in the Data tab."
        if not messagebox.askyesno("Mark as Completed", prompt):
            return
        profile["completed"] = True
        profile["completed_at"] = time.strftime("%Y-%m-%d")
        self._safe_save()
        write_log_file(self.data)
        self._refresh_data_tab()
        messagebox.showinfo("Nice work!", f"'{self.selected}' marked as completed.\nCheck the Data tab for your stats.")

    def _set_profile_icon(self):
        if not self.selected:
            return
        if not PIL_AVAILABLE:
            messagebox.showerror("Missing dependency",
                                  "Custom icons need Pillow.\nInstall with: pip install pillow")
            return
        path = filedialog.askopenfilename(
            title="Choose an image",
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
            messagebox.showerror("Couldn't set icon", str(e))
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

    def _set_profile_background(self):
        if not self.selected:
            return
        profile_name = self.selected
        win = tk.Toplevel(self.root)
        win.title("Change Background")
        win.configure(bg=BG)
        win.geometry("340x230")
        win.resizable(False, False)
        win.transient(self.root)
        win.grab_set()

        tk.Label(win, text=f"Background for '{profile_name}'", bg=BG, fg=TEXT,
                 font=FONT_MAIN, wraplength=300).pack(pady=(18, 14))

        def choose_color():
            c = colorchooser.askcolor(parent=win, title="Choose background color")
            if c and c[1]:
                self.data["profiles"][profile_name]["bg_color"] = c[1]
                self.data["profiles"][profile_name]["bg_image"] = None
                self._safe_save()
                self._render_background()
                win.destroy()

        def choose_image():
            if not PIL_AVAILABLE:
                messagebox.showerror("Missing dependency",
                                      "Custom backgrounds need Pillow.\nInstall with: pip install pillow")
                return
            path = filedialog.askopenfilename(
                title="Choose a background image",
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
                messagebox.showerror("Couldn't set background", str(e))
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
            self._render_background()
            win.destroy()

        def reset_default():
            self.data["profiles"][profile_name]["bg_color"] = None
            self.data["profiles"][profile_name]["bg_image"] = None
            self._safe_save()
            self._render_background()
            win.destroy()

        self._make_button(win, "Choose Solid Color", choose_color, bg=CARD, fg=TEXT).pack(fill="x", padx=24, pady=4)
        self._make_button(win, "Choose Image", choose_image, bg=CARD, fg=TEXT).pack(fill="x", padx=24, pady=4)
        self._make_button(win, "Reset to Default", reset_default, bg=CARD, fg=RED).pack(fill="x", padx=24, pady=(4, 10))

    # ---------- Export / Import ----------
    def _export_profile(self):
        if not self.selected:
            return
        if self.running:
            self._checkpoint()  # make sure "seconds" reflects the live session, not a stale value
        profile = self.data["profiles"][self.selected]
        export = {
            "name": self.selected,
            "seconds": profile.get("seconds", 0),
            "completed": profile.get("completed", False),
            "completed_at": profile.get("completed_at"),
            "genres": profile.get("genres", ["Uncategorized"]),
            "last_played": profile.get("last_played"),
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
            messagebox.showinfo("Exported", f"Profile exported to:\n{path}")
        except Exception as e:
            messagebox.showerror("Export failed", str(e))

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
            messagebox.showerror("Import failed", str(e))
            return

        name = imported.get("name", "Imported Game")
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
            "completed": imported.get("completed", False),
            "completed_at": imported.get("completed_at"),
            "genres": imported.get("genres") or ["Uncategorized"],
            "last_played": imported.get("last_played"),
        }
        self._safe_save()
        write_log_file(self.data)
        self._refresh_profile_list()
        self._select_profile(name)
        messagebox.showinfo("Imported", f"Imported profile as '{name}'")

    # ---------- Timer logic ----------
    def _toggle_play(self):
        if not self.selected:
            return
        if self.running:
            self._pause_current()
        else:
            self._start_current()

    def _start_current(self):
        self.running = True
        self.tick_start = time.time()
        self.last_autosave = time.time()
        if self.selected:
            self.data["profiles"][self.selected]["last_played"] = time.time()
        self._set_play_button_state()

    def _pause_current(self):
        if self.running and self.tick_start is not None:
            try:
                elapsed = time.time() - self.tick_start
                if self.selected in self.data["profiles"]:
                    self.data["profiles"][self.selected]["seconds"] += elapsed
                save_data(self.data)
                write_log_file(self.data)
            except Exception:
                pass  # never let a save/log failure block pausing or closing
        self.running = False
        self.tick_start = None
        self._set_play_button_state()
        self._update_timer_display()

    def _checkpoint(self):
        if self.running and self.tick_start is not None and self.selected:
            now = time.time()
            elapsed = now - self.tick_start
            try:
                if self.selected in self.data["profiles"]:
                    self.data["profiles"][self.selected]["seconds"] += elapsed
                save_data(self.data)
            except Exception:
                pass
            self.tick_start = now
            self.last_autosave = now

    def _set_play_button_state(self):
        if self.running:
            self.play_button.config(text="\u23f8  Pause", bg=RED, activebackground=RED)
            self._add_hover(self.play_button, RED)
            self.canvas.itemconfig(self.status_id, text="Tracking time\u2026", fill=GREEN)
        else:
            self.play_button.config(text="\u25b6  Play", bg=GREEN, activebackground=GREEN)
            self._add_hover(self.play_button, GREEN)
            self.canvas.itemconfig(self.status_id, text="Paused" if self.selected else "", fill=SUBTEXT)
        self._update_tray_status()

    def _current_total_seconds(self):
        if not self.selected:
            return 0
        base = self.data["profiles"][self.selected]["seconds"]
        if self.running and self.tick_start is not None:
            base += time.time() - self.tick_start
        return base

    def _update_timer_display(self):
        self.canvas.itemconfig(self.timer_id, text=format_seconds(self._current_total_seconds()))

    def _tick(self):
        if self.selected:
            self._update_timer_display()
        if self.running and self.last_autosave is not None:
            if time.time() - self.last_autosave >= self.autosave_interval:
                self._checkpoint()
        if self.running and time.time() - self.last_log_write >= self.log_interval:
            write_log_file(self.data)
            self.last_log_write = time.time()
        self.root.after(500, self._tick)

    # ---------- Settings (tabbed) ----------
    def _open_settings(self):
        win = tk.Toplevel(self.root)
        win.title("Settings")
        win.configure(bg=BG)
        win.geometry("460x560")
        win.resizable(False, False)
        win.transient(self.root)
        win.grab_set()

        notebook = ttk.Notebook(win)
        notebook.pack(fill="both", expand=True, padx=10, pady=10)

        tab_general = tk.Frame(notebook, bg=BG)
        tab_tray = tk.Frame(notebook, bg=BG)
        tab_appearance_outer = tk.Frame(notebook, bg=BG)
        notebook.add(tab_general, text="General")
        notebook.add(tab_tray, text="Tray")
        notebook.add(tab_appearance_outer, text="Appearance")

        # --- General tab ---
        startup_var = tk.BooleanVar(value=self.data["settings"].get("run_at_startup", False))
        tk.Label(tab_general, text="Startup", bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(18, 6))
        tk.Checkbutton(
            tab_general, text="Launch Game Timer when Windows starts",
            variable=startup_var, bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
            activeforeground=TEXT, font=FONT_MAIN, anchor="w", highlightthickness=0, bd=0
        ).pack(fill="x", padx=16)
        if not getattr(sys, "frozen", False):
            tk.Label(tab_general, text="Only works from the built .exe, not the .py script",
                     bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(2, 0))

        # --- Tray tab ---
        tray_var = tk.BooleanVar(value=self.data["settings"].get("tray_enabled", True))
        tk.Label(tab_tray, text="System Tray", bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(18, 6))
        tray_chk = tk.Checkbutton(
            tab_tray, text="Enable tray icon (green = tracking, red = paused)",
            variable=tray_var, bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
            activeforeground=TEXT, font=FONT_MAIN, anchor="w", highlightthickness=0, bd=0
        )
        tray_chk.pack(fill="x", padx=16)
        tk.Label(tab_tray,
                 text="When enabled, closing the window (X) hides it to the tray\ninstead of quitting. "
                      "Use 'Quit' in the tray's right-click menu to exit fully.",
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL, justify="left").pack(anchor="w", padx=16, pady=(10, 0))
        if not TRAY_AVAILABLE:
            tk.Label(tab_tray, text="Requires: pip install pillow pystray",
                     bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(8, 0))
            tray_chk.config(state="disabled")

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
        tk.Label(tab_appearance, text="Theme", bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
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

        self._make_button(tab_appearance, "Customize Colors\u2026", open_customizer, bg=CARD, fg=TEXT).pack(
            anchor="w", padx=16, pady=(8, 4))
        tk.Label(tab_appearance, text="Applies instantly when you hit Save.",
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(0, 4))

        # Accent override (fine-tune on top of whichever theme is active)
        tk.Label(tab_appearance, text="Accent Color", bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(16, 6))
        color_row = tk.Frame(tab_appearance, bg=BG)
        color_row.pack(fill="x", padx=16)
        swatch = tk.Label(color_row, text="     ", bg=self.data["settings"].get("accent", ACCENT_DEFAULT))
        swatch.pack(side="left", padx=(0, 8))

        def pick_color():
            c = colorchooser.askcolor(color=self.data["settings"].get("accent", ACCENT_DEFAULT),
                                       parent=win, title="Choose accent color")
            if c and c[1]:
                self.data["settings"]["accent"] = c[1]
                swatch.config(bg=c[1])

        self._make_button(color_row, "Change", pick_color, bg=CARD, fg=TEXT, width=8).pack(side="left")
        tk.Label(tab_appearance, text="Applies instantly when you hit Save.",
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(4, 0))

        # Icon size
        tk.Label(tab_appearance, text="Profile Icon Size", bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(20, 6))
        current_label = next((k for k, v in ICON_SIZE_OPTIONS.items() if v == self.icon_size), "Medium")
        icon_size_var = tk.StringVar(value=current_label)
        size_row = tk.Frame(tab_appearance, bg=BG)
        size_row.pack(fill="x", padx=16)
        for label in ICON_SIZE_OPTIONS:
            tk.Radiobutton(
                size_row, text=label, variable=icon_size_var, value=label,
                bg=BG, fg=TEXT, selectcolor=CARD, activebackground=BG,
                activeforeground=TEXT, font=FONT_SMALL, highlightthickness=0, bd=0
            ).pack(anchor="w")
        tk.Label(tab_appearance, text="Applies immediately.",
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL).pack(anchor="w", padx=16, pady=(4, 0))

        # Font
        tk.Label(tab_appearance, text="Font", bg=BG, fg=TEXT, font=(FONT_FAMILY_UI, 12, "bold")).pack(
            anchor="w", padx=16, pady=(20, 6))
        font_var = tk.StringVar(value=self.data["settings"].get("font_family", "Segoe UI"))
        font_menu = tk.OptionMenu(tab_appearance, font_var, *FONT_CHOICES)
        font_menu.config(bg=CARD, fg=TEXT, activebackground=CARD, activeforeground=TEXT,
                         bd=0, highlightthickness=0, font=FONT_MAIN, width=16)
        font_menu["menu"].config(bg=CARD, fg=TEXT)
        font_menu.pack(anchor="w", padx=16)
        tk.Label(tab_appearance, text="Timer digits stay monospaced for alignment.\nApplies instantly when you hit Save.",
                 bg=BG, fg=SUBTEXT, font=FONT_SMALL, justify="left").pack(anchor="w", padx=16, pady=(4, 16))

        def save_and_close():
            self.data["settings"]["tray_enabled"] = tray_var.get()
            wanted_startup = startup_var.get()
            self.data["settings"]["run_at_startup"] = wanted_startup
            self.data["settings"]["icon_size"] = ICON_SIZE_OPTIONS[icon_size_var.get()]
            self.data["settings"]["theme"] = theme_var.get()
            self.data["settings"]["custom_colors"] = custom_colors_ref
            self.data["settings"]["font_family"] = font_var.get()
            self._safe_save()

            if getattr(sys, "frozen", False) and WINREG_AVAILABLE:
                try:
                    set_startup(wanted_startup)
                except Exception as e:
                    messagebox.showerror("Startup setting failed", str(e))

            win.destroy()
            self._apply_appearance_and_rebuild()

        self._make_button(win, "Save", save_and_close, bg=self.accent, fg="#1e1e2e").pack(pady=(10, 4))

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
        self.accent = self.data["settings"].get("accent", ACCENT_DEFAULT)
        self.icon_size = self.data["settings"].get("icon_size", 36)
        self._apply_tray_setting()
        self._rebuild_ui()

    def _rebuild_ui(self):
        """Tears down and rebuilds the entire window in place — used after an
        appearance change so it applies instantly without a restart. Running
        timers and current selection are preserved across the rebuild."""
        was_running = self.running
        selected_before = self.selected
        if self.running:
            self._pause_current()  # commit elapsed time before tearing anything down

        for child in self.root.winfo_children():
            child.destroy()

        self.root.configure(bg=BG)
        self._build_ui()
        self._refresh_profile_list()

        if selected_before and selected_before in self.data["profiles"]:
            self._select_profile(selected_before)
        else:
            self._render_background()

        if was_running:
            self._start_current()

        self._update_tray_status()

    def _open_color_customizer(self, parent_win, base_colors, custom_colors_ref, theme_var):
        editor = tk.Toplevel(parent_win)
        editor.title("Customize Colors")
        editor.configure(bg=BG)
        editor.geometry("340x420")
        editor.resizable(False, False)
        editor.transient(parent_win)
        editor.grab_set()

        working = dict(base_colors)
        roles = [
            ("bg", "Background"), ("panel", "Sidebar Panel"), ("card", "Cards / Buttons"),
            ("text", "Text"), ("subtext", "Muted Text"), ("accent", "Accent"),
        ]
        tk.Label(editor, text="Pick a color for each part of the UI", bg=BG, fg=TEXT,
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

            self._make_button(row, "Change", make_picker(), bg=CARD, fg=TEXT, width=8).pack(side="left")

        def use_these_colors():
            custom_colors_ref.clear()
            custom_colors_ref.update(working)
            theme_var.set("Custom")
            editor.destroy()

        self._make_button(editor, "Use These Colors", use_these_colors,
                           bg=working.get("accent", ACCENT_DEFAULT), fg="#1e1e2e").pack(pady=16)

    # ---------- System tray ----------
    def _apply_tray_setting(self):
        enabled = self.data["settings"].get("tray_enabled", True) and TRAY_AVAILABLE
        if enabled and self.tray_icon is None:
            self._start_tray()
        elif not enabled and self.tray_icon is not None:
            self._stop_tray()

    def _start_tray(self):
        color = GREEN_RGBA if self.running else RED_RGBA
        image = make_tray_image(color)
        menu = pystray.Menu(
            pystray.MenuItem("Show Game Timer", lambda: self.root.after(0, self._show_window), default=True),
            pystray.MenuItem(lambda item: "Pause" if self.running else "Play",
                              lambda: self.root.after(0, self._toggle_play)),
            pystray.MenuItem("Quit", lambda: self.root.after(0, self._quit_app)),
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
            color = GREEN_RGBA if self.running else RED_RGBA
            try:
                self.tray_icon.icon = make_tray_image(color)
                status = "Tracking" if self.running else "Paused"
                self.tray_icon.title = f"Game Timer \u2014 {self.selected or 'No profile'} ({status})"
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
            if self.running:
                self._pause_current()
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
        _tmp = tk.Tk()
        _tmp.withdraw()
        messagebox.showwarning(
            "Game Timer is already running",
            "Game Timer is already open.\nCheck your system tray, or close the existing window "
            "before opening another."
        )
        _tmp.destroy()
        sys.exit(0)

    root = tk.Tk()
    app = GameTimerApp(root)
    root.mainloop()
