/**
 * Which build this is. Baked in at build time by electron.vite.config.ts from
 * the GAMUT_CHANNEL env var — 'dev' for `npm run package:dev`, 'stable' for
 * everything else.
 *
 * A dev build is deliberately a COMPLETELY separate application from the public
 * one: its own install directory, its own Start Menu entry, its own save data,
 * its own single-instance lock. Both can be installed and running at once, and
 * neither can see or damage the other's data. That is the whole point — v3 is
 * being built against a schema the public build does not understand, and the
 * public build must never be exposed to it.
 */
declare const __GAMUT_CHANNEL__: string

export const IS_DEV_CHANNEL = __GAMUT_CHANNEL__ === 'dev'

/**
 * The product's name, shown in the title bar, the tray tooltip and the About
 * tab. The two installs are otherwise pixel-identical, so this is the only
 * thing telling you which one you are looking at.
 *
 * Deliberately NOT used inside sentences. Running prose keeps the short form —
 * "Launch Gamut when Windows starts" reads, "Launch Gamut Launcher when Windows
 * starts" does not. Those strings live in the locale files and say "Gamut".
 */
export const APP_DISPLAY_NAME = IS_DEV_CHANNEL ? 'Gamut Launcher Dev' : 'Gamut Launcher'

/**
 * Folder under %APPDATA% holding the save file, icons, backgrounds and backups.
 *
 * This MUST differ per channel, and it is the single most important line in
 * this file. A dev build sharing the public folder would read and write real
 * user data — and because the store's zod schema strips keys it does not know
 * about, simply opening the public build afterwards would silently delete
 * everything a v3 dev build had written, then save the stripped version back
 * over the original.
 *
 * 'gametimer' (not 'gamut') for the stable channel is deliberate and load
 * bearing — see the pinning comment in main/index.ts.
 */
export const USER_DATA_FOLDER = IS_DEV_CHANNEL ? 'gametimer-dev' : 'gametimer'

/**
 * Windows taskbar grouping and toast identity. Sharing one value would merge
 * the two installs into a single taskbar button and make their notifications
 * indistinguishable.
 */
export const APP_USER_MODEL_ID = IS_DEV_CHANNEL
  ? 'com.darkyspear5.gametimer2.dev'
  : 'com.darkyspear5.gametimer2'
