; Game Timer — Inno Setup installer script
; Requires Inno Setup (free): https://jrsoftware.org/isinfo.php
;
; HOW TO USE:
; 1. Put this file (installer.iss) in your main GameTimer folder — the same
;    folder that contains "dist\GameTimer.exe" and "icon.ico".
; 2. Open installer.iss in Inno Setup (double-click it, or open via
;    Inno Setup Compiler).
; 3. Click "Compile" (or press Ctrl+F9).
; 4. Your installer appears as Output\GameTimerSetup.exe — that's the single
;    file you send to other people. They run it, pick a folder, click
;    through, done.
;
; WHAT THIS INSTALLER DOES
; - Lets the person choose their own install folder (a "Select Destination
;   Location" page appears during setup; suggested default is
;   %LocalAppData%\Programs\GameTimer, which needs no admin rights).
; - Creates a Start Menu shortcut, plus an optional Desktop shortcut.
; - Creates a Start Menu "Uninstall Game Timer" shortcut, and registers
;   properly with Windows "Apps & Features" / "Add or Remove Programs" —
;   Inno Setup builds the uninstaller automatically, no extra script needed.
; - Data (game_timer_data.json, icons\, backgrounds\, profiles\,
;   game_timer_log.txt) is created next to the exe on first run, wherever
;   the person installed it. Uninstalling removes the program files but
;   leaves that data behind, so reinstalling later doesn't lose progress.
;   Delete the install folder manually for a totally clean removal.
;
; NOTE ON INSTALL LOCATION: if someone deliberately browses to a system
; folder like Program Files during setup, Windows may require admin rights
; to write there. The suggested default avoids this entirely.

#define MyAppName "Game Timer"
#define MyAppVersion "1.9"
#define MyAppExeName "GameTimer.exe"

[Setup]
AppId={{563FEB11-9CE2-4DFB-BA99-B87775E93449}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\GameTimer
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=no
AllowNoIcons=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=GameTimerSetup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma
SolidCompression=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "dist\GameTimer.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
