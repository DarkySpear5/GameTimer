/*
 * User-reported bug (2026-08-14, mid sub-categories session): "when we start
 * 2 timer at once, the overlay just won't work even on the detected running
 * game. and after stopping the timer, the overlay just doesnt work anymore."
 *
 * Reproduces with two linked profiles, both timers started via IPC
 * (window.api.timer.start), while GAMUT_TEST_FOREGROUND fakes OS focus on
 * one of them at a time — same test seams verify-keybinds-screenshots-
 * overlay.cjs already established. GAMUT_TEST_FOREGROUND is read fresh on
 * every getForegroundGameWindow() call, so it can be flipped mid-run via
 * app.evaluate() mutating process.env in the main process.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-overlay-two-timers-tmp')
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

function seed(label) {
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
      profiles: {
        'Game A': game('Game A', { installDir: 'C:\\Games\\GameA' }),
        'Game B': game('Game B', { installDir: 'C:\\Games\\GameB' })
      },
      lastSelected: null,
      settings: {
        trayEnabled: false,
        checkForUpdates: false,
        language: 'en',
        autoFetchArt: false,
        keybinds: { startPauseTimer: 'Ctrl+F9', saveScreenshot: 'Ctrl+F10', toggleOverlay: 'Ctrl+F11' },
        overlay: { enabled: true, corner: 'top-right', scale: 1, shadow: true },
        subCategoriesEnabled: true
      }
    })
  )
  return { appDataRoot }
}

const BOUNDS_A = { X: 100, Y: 100, Width: 800, Height: 600 }
const BOUNDS_B = { X: 900, Y: 100, Width: 800, Height: 600 }
const FOCUS_A = JSON.stringify({ ExePath: 'C:\\Games\\GameA\\game.exe', ProcessName: 'game', Title: 'Game A Window', ...BOUNDS_A })
const FOCUS_B = JSON.stringify({ ExePath: 'C:\\Games\\GameB\\game.exe', ProcessName: 'game', Title: 'Game B Window', ...BOUNDS_B })

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms))
  ])
}

async function launch(label, foreground) {
  console.log(`  [${label}] seeding...`)
  const { appDataRoot } = seed(label)
  console.log(`  [${label}] electron.launch()...`)
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
  console.log(`  [${label}] ready`)
  return { app, win, appDataRoot }
}

async function closeApp(label, app) {
  console.log(`  [${label}] killing process tree...`)
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

async function setForeground(app, json) {
  await app.evaluate(({ }, value) => {
    process.env.GAMUT_TEST_FOREGROUND = value
  }, json)
}

const readProfiles = (appDataRoot) =>
  JSON.parse(fs.readFileSync(path.join(appDataRoot, USER_DATA_FOLDER, 'game_timer_data.json'), 'utf8')).profiles

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  ensureBundlePatched()

  console.log('\n=== Repro: overlay while 2 timers run at once, focus on Game A ===')
  {
    const { app, win, appDataRoot } = await launch('two-timers', FOCUS_A)

    await win.evaluate(() => window.api.timer.start('Game A'))
    await win.evaluate(() => window.api.timer.start('Game B'))
    await win.waitForTimeout(300)
    check('Game A timer running', readProfiles(appDataRoot)['Game A'].activeSession !== null, true)
    check('Game B timer running', readProfiles(appDataRoot)['Game B'].activeSession !== null, true)

    await win.waitForTimeout(2500) // overlay poll cycle (2s)
    check('overlay visible while focused on Game A with 2 timers running', await overlayVisible(app), true)

    console.log('  --- switching focus to Game B ---')
    await setForeground(app, FOCUS_B)
    await win.waitForTimeout(2500)
    check('overlay still visible after focus switch to Game B', await overlayVisible(app), true)

    console.log('  --- pausing Game A (the NOT-focused timer) ---')
    await win.evaluate(() => window.api.timer.pause('Game A'))
    await win.waitForTimeout(300)
    check('Game A timer paused', readProfiles(appDataRoot)['Game A'].activeSession, null)
    check('Game B timer still running', readProfiles(appDataRoot)['Game B'].activeSession !== null, true)

    await win.waitForTimeout(2500)
    check('overlay still visible on Game B after Game A stopped', await overlayVisible(app), true)

    console.log('  --- pausing Game B too (now nothing running) ---')
    await win.evaluate(() => window.api.timer.pause('Game B'))
    await win.waitForTimeout(300)

    console.log('  --- re-starting Game B alone and refocusing it ---')
    await win.evaluate(() => window.api.timer.start('Game B'))
    await win.waitForTimeout(2500)
    check('overlay works again for a single timer after both were stopped', await overlayVisible(app), true)

    await closeApp('two-timers', app)
  }

  console.log('\n=== Repro variant: truly concurrent start calls (no await between them) ===')
  {
    const { app, win, appDataRoot } = await launch('concurrent-start', FOCUS_A)
    await Promise.all([
      win.evaluate(() => window.api.timer.start('Game A')),
      win.evaluate(() => window.api.timer.start('Game B'))
    ])
    await win.waitForTimeout(300)
    check('Game A timer running (concurrent start)', readProfiles(appDataRoot)['Game A'].activeSession !== null, true)
    check('Game B timer running (concurrent start)', readProfiles(appDataRoot)['Game B'].activeSession !== null, true)
    await win.waitForTimeout(2500)
    check('overlay visible after concurrent start of 2 timers', await overlayVisible(app), true)
    await closeApp('concurrent-start', app)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
