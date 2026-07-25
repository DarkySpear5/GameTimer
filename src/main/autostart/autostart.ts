import { app } from 'electron'

/**
 * Electron's cross-platform equivalent of v1's HKCU Run-key registry write —
 * setLoginItemSettings handles the registry (or LaunchAgent/.desktop
 * equivalents on other platforms) internally.
 */
export function setRunAtStartup(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled })
}

export function getRunAtStartup(): boolean {
  return app.getLoginItemSettings().openAtLogin
}
