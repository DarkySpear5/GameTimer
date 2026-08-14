import { app } from 'electron'
import { join } from 'path'

/**
 * Unlike v1 (which lived entirely next to its own exe, portable-style), v2
 * uses the OS-conventional per-user app data location — standard Electron
 * practice, and the reason a first-run legacy importer exists at all (see
 * main/importer/legacyImport.ts).
 */
function root(): string {
  return app.getPath('userData')
}

export const paths = {
  root,
  dataFile: () => join(root(), 'game_timer_data.json'),
  dataFileTmp: () => join(root(), 'game_timer_data.json.tmp'),
  logFile: () => join(root(), 'game_timer_log.txt'),
  backupsDir: () => join(root(), 'backups'),
  iconsDir: () => join(root(), 'icons'),
  backgroundsDir: () => join(root(), 'backgrounds'),
  coversDir: () => join(root(), 'covers'),
  profilesDir: () => join(root(), 'profiles'),
  firstRunFile: () => join(root(), 'firstrun.json'),
  /**
   * Rooted at Documents, not userData — screenshots are meant to be found by
   * the user in Explorer, unlike everything else in `paths`. GAMUT_TEST_DOCUMENTS
   * lets a Playwright verify script isolate this the same way GAMUT_TEST_APPDATA
   * isolates userData — without it, a verify run would write real files into
   * the user's real Documents folder.
   */
  screenshotsDir: (profileName: string) =>
    join(process.env.GAMUT_TEST_DOCUMENTS || app.getPath('documents'), 'Gamut', 'Screenshots', profileName)
}
