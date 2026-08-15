/*
 * Real bug, found live: Vindictus (Nexon, GameGuard anti-cheat) runs
 * ELEVATED, so Windows blocks this unelevated app from reading its process
 * path at all — the game auto-start timer, Launch/Stop button, and overlay
 * all silently failed because every detection path required a resolvable
 * path. Fixed with a name-only fallback (see watchMatch.ts), deliberately
 * scoped to Nexon/Battle.net/EA (`launchUri` schemes nxl/battlenet/
 * origin2/link2ea) — every other launcher's matching must stay untouched.
 *
 * GAMUT_TEST_FOREGROUND with ExePath: null simulates exactly what the real
 * PowerShell probe now returns for an elevated process: no path, but a
 * real ProcessName.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-elevated-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const BUNDLE = path.join(__dirname, '..', 'out', 'main', 'index.js')
const USER_DATA_FOLDER = 'gametimer'

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`
  )
}

function ensureBundlePatched() {
  const original = fs.readFileSync(BUNDLE, 'utf8')
  const patchedTarget = 'process.env.GAMUT_TEST_APPDATA || electron.app.getPath("appData")'
  if (original.includes(patchedTarget)) return
  const target = 'electron.app.getPath("appData")'
  if (!original.includes(target)) {
    throw new Error(`Could not find ${JSON.stringify(target)} in ${BUNDLE} to patch.`)
  }
  fs.writeFileSync(BUNDLE, original.replace(target, `(${patchedTarget})`))
}

function game(name, extra = {}) {
  return {
    name, seconds: 0, iconFile: null, bgColor: null, bgImage: null,
    status: 'in_progress', statusAt: null, statusSeconds: null, genres: [],
    lastPlayed: null, startedDate: null, notes: '', noteList: [], rating: 0,
    sessionStats: { count: 0, totalSeconds: 0, longestSeconds: 0, firstPlayedAt: null, lastPlayedAt: null },
    sessionLog: [], activeSession: null, exePath: null, steamAppId: null,
    launchUri: null, installDir: null, autoFetchArt: null, launches: 0,
    openSeconds: 0, autoStartTimer: null, genresFromDetection: false,
    favorite: false, coverFile: null, subCategories: [], subCategoriesEnabled: null,
    ...extra
  }
}

function seed(label, profile, overlayEnabled) {
  const appDataRoot = path.join(ROOT, label)
  const userDataDir = path.join(appDataRoot, USER_DATA_FOLDER)
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(
    path.join(userDataDir, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    path.join(userDataDir, 'game_timer_data.json'),
    JSON.stringify({
      profiles: { [profile.name]: profile },
      lastSelected: null,
      settings: {
        trayEnabled: false,
        checkForUpdates: false,
        language: 'en',
        keybinds: { startPauseTimer: 'Ctrl+F9', saveScreenshot: 'Ctrl+F10', toggleOverlay: 'Ctrl+F11' },
        overlay: { enabled: overlayEnabled, corner: 'top-right', scale: 1, shadow: true }
      }
    })
  )
  return appDataRoot
}

const readProfile = (appDataRoot, name) =>
  JSON.parse(fs.readFileSync(path.join(appDataRoot, USER_DATA_FOLDER, 'game_timer_data.json'), 'utf8')).profiles[name]

// Exactly what foregroundWindow.ts's real PowerShell probe now returns for
// an elevated process: ExePath null (path unreadable), ProcessName present.
const VINDICTUS_ELEVATED_FOCUS = JSON.stringify({
  ExePath: null,
  ProcessName: 'Vindictus_x64',
  Title: 'Vindictus',
  X: 0,
  Y: 0,
  Width: 2560,
  Height: 1440
})

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms))
  ])
}

async function launch(label, profile, foreground, overlayEnabled) {
  const appDataRoot = seed(label, profile, overlayEnabled)
  const app = await withTimeout(
    electron.launch({
      args: ['out/main/index.js'],
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, GAMUT_TEST_APPDATA: appDataRoot, GAMUT_TEST_FOREGROUND: foreground }
    }),
    30000,
    `electron.launch(${label})`
  )
  const win = await withTimeout(app.firstWindow(), 30000, `firstWindow(${label})`)
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1000)
  return { app, win, appDataRoot }
}

async function closeApp(app) {
  const pid = app.process().pid
  await new Promise((resolve) => {
    require('child_process').execFile('taskkill', ['/F', '/T', '/PID', String(pid)], () => resolve())
  })
  await new Promise((r) => setTimeout(r, 500))
}

async function overlayVisible(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const overlay = BrowserWindow.getAllWindows().find((w) => w.getSize()[0] < 900)
    return overlay ? overlay.isVisible() : false
  })
}

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  ensureBundlePatched()

  console.log('\n=== Nexon game (allowlisted launcher): keybind starts the timer via name-only match, path unresolvable ===')
  {
    const vindictus = game('Vindictus', {
      installDir: null,
      exePath: 'C:\\Nexon\\Library\\vindictus\\appdata\\en-US\\Vindictus_x64.exe',
      launchUri: 'nxl://launch/10300'
    })
    const { app, win, appDataRoot } = await launch('nexon-elevated', vindictus, VINDICTUS_ELEVATED_FOCUS, true)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('startPauseTimer'))
    await win.waitForTimeout(300)
    check('timer started despite no resolvable process path', readProfile(appDataRoot, 'Vindictus').activeSession !== null, true)

    await win.waitForTimeout(2500) // overlayWindow polls every 2s
    check('overlay visible over the elevated, path-unresolvable process', await overlayVisible(app), true)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('startPauseTimer'))
    await win.waitForTimeout(300)
    check('keybind pauses it again the same way', readProfile(appDataRoot, 'Vindictus').activeSession, null)

    await closeApp(app)
  }

  console.log('\n=== Steam game (NOT an allowlisted launcher): the same path-unresolvable focus must NOT match it ===')
  {
    // Same ProcessName coincidentally, same elevated/no-path situation — the
    // launcher scoping (not just the exe name) is what must gate this.
    const steamGame = game('Vindictus_x64 Clone', {
      installDir: null,
      exePath: 'D:\\SteamLibrary\\common\\SomeGame\\Vindictus_x64.exe',
      launchUri: null,
      steamAppId: 99999
    })
    const { win, appDataRoot, app } = await launch('steam-not-elevated', steamGame, VINDICTUS_ELEVATED_FOCUS, true)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('startPauseTimer'))
    await win.waitForTimeout(300)
    check(
      'keybind does NOT start a non-allowlisted-launcher game via name-only match',
      readProfile(appDataRoot, 'Vindictus_x64 Clone').activeSession,
      null
    )

    await win.waitForTimeout(2500)
    check('overlay stays hidden — no match for this profile either', await overlayVisible(app), false)

    await closeApp(app)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
