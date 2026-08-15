/*
 * M/N/O: global keybinds (start/pause + screenshot), the screenshot gallery,
 * and the in-game overlay — driven through the real packaged app. Uses three
 * test seams neither Playwright nor a real OS key press can provide:
 *   - GAMUT_TEST_FOREGROUND fakes "which window is OS-focused" instead of
 *     depending on whatever really has focus during a CI/dev run.
 *   - window.__gamutTest.triggerKeybind(kind) calls the exact handler a real
 *     global hotkey press calls — actual OS-level global hotkeys aren't
 *     something Playwright can inject.
 *   - GAMUT_TEST_DOCUMENTS isolates the screenshot folder, same reasoning as
 *     GAMUT_TEST_APPDATA isolates save data.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-kso-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const DOCS = path.join(SCRATCH, 'documents')
const BUNDLE = path.join(__dirname, '..', 'out', 'main', 'index.js')

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
    favorite: false, coverFile: null, ...extra
  }
}

// GAMUT_TEST_APPDATA maps to app.getPath('appData'); the app then joins
// USER_DATA_FOLDER ('gametimer') onto that for the real userData dir — so
// seed files belong one level deeper than the value passed as
// GAMUT_TEST_APPDATA, same as verify-notes.cjs's ROOT/DATA split.
const USER_DATA_FOLDER = 'gametimer'

const readProfiles = (appDataRoot) =>
  JSON.parse(fs.readFileSync(path.join(appDataRoot, USER_DATA_FOLDER, 'game_timer_data.json'), 'utf8')).profiles

/**
 * Isolates app.getPath('appData') the same way every other verify script
 * does. Idempotent — but the idempotency check must look for the actual
 * PATCHED expression, not merely the string "GAMUT_TEST_APPDATA": main's own
 * source (dev.ipc.ts's env-var gate) legitimately contains that literal
 * string too, so checking for its bare presence skipped patching on every
 * run once that code existed, silently leaving getPath("appData") pointed
 * at the real userData folder.
 */
function ensureBundlePatched() {
  const original = fs.readFileSync(BUNDLE, 'utf8')
  const patchedTarget = 'process.env.GAMUT_TEST_APPDATA || electron.app.getPath("appData")'
  if (original.includes(patchedTarget)) return
  const target = 'electron.app.getPath("appData")'
  if (!original.includes(target)) {
    throw new Error(
      `Could not find ${JSON.stringify(target)} in ${BUNDLE} to patch — the compiled output shape may have changed; inspect it and update this script's replace target.`
    )
  }
  fs.writeFileSync(BUNDLE, original.replace(target, `(${patchedTarget})`))
}

/**
 * Each launch gets its own userData/documents subfolder, not one shared
 * SCRATCH path — sequential electron.launch() calls in one script otherwise
 * risk the next launch racing the previous process's exit for the same
 * single-instance lock file, which quits the new instance immediately and
 * leaves app.firstWindow() waiting forever for a window that's never made.
 */
function seed(label, overlayEnabled, corner = 'top-right') {
  const appDataRoot = path.join(ROOT, label)
  const userDataDir = path.join(appDataRoot, USER_DATA_FOLDER)
  const docs = path.join(DOCS, label)
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(docs, { recursive: true })
  fs.writeFileSync(
    path.join(userDataDir, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    path.join(userDataDir, 'game_timer_data.json'),
    JSON.stringify({
      profiles: {
        'Focused Game': game('Focused Game', { installDir: 'C:\\Games\\FocusedGame' })
      },
      lastSelected: null,
      settings: {
        trayEnabled: false,
        checkForUpdates: false,
        language: 'en',
        autoFetchArt: false,
        keybinds: { startPauseTimer: 'Ctrl+F9', saveScreenshot: 'Ctrl+F10', toggleOverlay: 'Ctrl+F11' },
        overlay: { enabled: overlayEnabled, corner, scale: 1, shadow: true }
      }
    })
  )
  return { appDataRoot, docs }
}

// Deliberately NOT a fullscreen/display-sized window — a real windowed game
// (see the Forager report this was built to fix) can sit anywhere on the
// desktop, nowhere near its edges. Anchoring the overlay to the DISPLAY
// instead of this rect is exactly the bug that shipped: it visually passed
// every other check ("overlay is visible") while landing somewhere the
// player never looks.
const GAME_BOUNDS = { X: 200, Y: 150, Width: 1280, Height: 800 }
const FOCUSED_ON_GAME = JSON.stringify({
  ExePath: 'C:\\Games\\FocusedGame\\game.exe',
  Title: 'Focused Game Window',
  ...GAME_BOUNDS
})

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms))
  ])
}

async function launch(label, foreground, overlayEnabled, corner = 'top-right') {
  console.log(`  [${label}] seeding...`)
  const { appDataRoot, docs } = seed(label, overlayEnabled, corner)
  console.log(`  [${label}] electron.launch()...`)
  const app = await withTimeout(
    electron.launch({
      args: ['out/main/index.js'],
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        GAMUT_TEST_APPDATA: appDataRoot,
        GAMUT_TEST_DOCUMENTS: docs,
        GAMUT_TEST_FOREGROUND: foreground
      }
    }),
    30000,
    `electron.launch(${label})`
  )
  console.log(`  [${label}] app.firstWindow()...`)
  const win = await withTimeout(app.firstWindow(), 30000, `firstWindow(${label})`)
  console.log(`  [${label}] waitForLoadState...`)
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1000)
  console.log(`  [${label}] ready`)
  return { app, win, appDataRoot, docs }
}

/**
 * Hard-kills the whole process TREE rather than app.close()'s graceful quit.
 * Two problems, found by direct repro:
 *   1. Under Playwright's CDP-driven close, this app's quit sequence
 *      reliably fires 'before-quit' and then stalls before
 *      'window-all-closed'/'will-quit' ever run.
 *   2. Killing only the top-level electron.exe (proc.kill()) leaves its
 *      renderer/GPU/utility subprocesses running — they don't die with the
 *      parent on Windows here. Those survivors keep holding the
 *      requestSingleInstanceLock() file for that scratch userData path,
 *      so the NEXT launch against the same path silently self-quits with
 *      no window (acquireSingleInstanceLock returns false) even though the
 *      directory itself was freshly re-seeded.
 * `taskkill /T` kills the whole tree, not just the one PID. These are
 * disposable, isolated test launches with nothing to persist that seed()
 * doesn't already control, so this is the right call here — unlike a real
 * user quitting via the window chrome, which never goes through this path.
 */
async function closeApp(label, app) {
  console.log(`  [${label}] killing process tree...`)
  const pid = app.process().pid
  await new Promise((resolve) => {
    require('child_process').execFile('taskkill', ['/F', '/T', '/PID', String(pid)], () => resolve())
  })
  await new Promise((r) => setTimeout(r, 500))
  console.log(`  [${label}] closed`)
}

/** The main window defaults to 1100px wide; the overlay's base width is 200 (up to 400 at 2.0x scale) — clearly distinguishable. */
async function overlayVisible(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const overlay = BrowserWindow.getAllWindows().find((w) => w.getSize()[0] < 900)
    return overlay ? overlay.isVisible() : false
  })
}

async function overlayBounds(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const overlay = BrowserWindow.getAllWindows().find((w) => w.getSize()[0] < 900)
    return overlay ? overlay.getBounds() : null
  })
}

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  ensureBundlePatched()

  console.log('\n=== M: invalid combo is rejected without registering anything ===')
  {
    const { app, win } = await launch('combo', FOCUSED_ON_GAME, false)
    const result = await win.evaluate(() => window.api.keybinds.set('startPauseTimer', 'F9'))
    check('bare single key rejected', result, { ok: false, error: 'invalid_combo' })
    await closeApp('combo', app)
  }

  console.log('\n=== M: hotkey no-ops when nothing tracked is focused ===')
  {
    const { app, win, appDataRoot } = await launch('unfocused', '', false)
    await win.evaluate(() => window.__gamutTest.triggerKeybind('startPauseTimer'))
    await win.waitForTimeout(300)
    check('timer still not running', readProfiles(appDataRoot)['Focused Game'].activeSession, null)
    await closeApp('unfocused', app)
  }

  console.log("\n=== M: hotkey starts, then pauses, the focused+linked game's timer ===")
  console.log('=== N: screenshot hotkey saves a PNG, visible via screenshots.list ===')
  {
    const { app, win, appDataRoot, docs } = await launch('mn', FOCUSED_ON_GAME, false)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('startPauseTimer'))
    await win.waitForTimeout(300)
    check('timer started', readProfiles(appDataRoot)['Focused Game'].activeSession !== null, true)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('startPauseTimer'))
    await win.waitForTimeout(300)
    const paused = readProfiles(appDataRoot)['Focused Game']
    check('timer paused', paused.activeSession, null)
    check('some time was recorded', paused.seconds > 0, true)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('saveScreenshot'))
    await win.waitForTimeout(500)
    const shotDir = path.join(docs, 'Gamut', 'Screenshots', 'Focused Game')
    const shots = fs.existsSync(shotDir) ? fs.readdirSync(shotDir) : []
    check('one screenshot file saved', shots.length, 1)
    check('it is a PNG', shots[0] && shots[0].endsWith('.png'), true)

    const listed = await win.evaluate((name) => window.api.screenshots.list(name), 'Focused Game')
    check('screenshots.list sees the same file', listed.length, 1)

    await closeApp('mn', app)
  }

  console.log('\n=== O: overlay window appears only while a linked game is focused and enabled ===')
  {
    const { app, win } = await launch('overlay', FOCUSED_ON_GAME, true)
    await win.waitForTimeout(2500) // overlayWindow polls every 2s
    check('overlay visible while focused+linked and enabled', await overlayVisible(app), true)

    // Anchored to the GAME window's rect, not the display — top-right corner,
    // scale 1, MARGIN 8, BASE_WIDTH/HEIGHT 200x40 (overlayWindow.ts).
    // GAME_BOUNDS is PHYSICAL pixels (what the real probe reports); converted
    // through the app's own screenToDipRect rather than assumed 1:1, so this
    // stays correct on a scaled display instead of only passing at 100%.
    const dipGameBounds = await app.evaluate(
      ({ screen }, rect) => screen.screenToDipRect(null, rect),
      { x: GAME_BOUNDS.X, y: GAME_BOUNDS.Y, width: GAME_BOUNDS.Width, height: GAME_BOUNDS.Height }
    )
    const expected = {
      x: dipGameBounds.x + dipGameBounds.width - 200 - 8,
      y: dipGameBounds.y + 8,
      width: 200,
      height: 40
    }
    check('overlay anchored to the game window, not the display', await overlayBounds(app), expected)

    console.log('  --- toggleOverlay keybind hides, then re-shows it ---')
    await win.evaluate(() => window.__gamutTest.triggerKeybind('toggleOverlay'))
    await win.waitForTimeout(500)
    check('hidden after first toggle', await overlayVisible(app), false)

    await win.evaluate(() => window.__gamutTest.triggerKeybind('toggleOverlay'))
    await win.waitForTimeout(2500) // needs a poll tick to re-show
    check('visible again after second toggle', await overlayVisible(app), true)

    await win.evaluate(() =>
      window.api.settings.update({ overlay: { enabled: false, corner: 'top-right', scale: 1, shadow: true } })
    )
    await win.waitForTimeout(300) // onSettingsChanged reacts immediately
    check('overlay hidden once disabled via settings', await overlayVisible(app), false)

    await closeApp('overlay', app)
  }

  console.log('\n=== O: bottom-anchored overlay clamps to the full display, not the taskbar work-area ===')
  {
    // Real bug, found live on the user's own machine: a borderless game
    // covering the WHOLE display (taskbar auto-hidden behind it, same as
    // Grim Dawn) got its bottom-right-anchored overlay pulled 32px up off
    // the game's true bottom edge, because the clamp used
    // getDisplayMatching().workArea (which excludes the taskbar's reserved
    // strip) instead of .bounds. Reproduced here by faking a "game" window
    // exactly as large as the real primary display.
    const probe = await launch('display-probe', '', false)
    const display = await probe.app.evaluate(({ screen }) => {
      const d = screen.getPrimaryDisplay()
      return { bounds: d.bounds, workArea: d.workArea, physical: screen.dipToScreenRect(null, d.bounds) }
    })
    await closeApp('display-probe', probe.app)

    if (display.workArea.height >= display.bounds.height && display.workArea.width >= display.bounds.width) {
      console.log('  SKIP  this display reserves no taskbar strip — the bug is not exercisable here')
    } else {
      const FULLSCREEN_GAME = JSON.stringify({
        ExePath: 'C:\\Games\\FocusedGame\\game.exe',
        Title: 'Focused Game Fullscreen',
        X: display.physical.x,
        Y: display.physical.y,
        Width: display.physical.width,
        Height: display.physical.height
      })
      const { app: app2, win: win2 } = await launch('overlay-taskbar', FULLSCREEN_GAME, true, 'bottom-right')
      await win2.waitForTimeout(2500) // overlayWindow polls every 2s
      const expected = {
        x: display.bounds.x + display.bounds.width - 200 - 8,
        y: display.bounds.y + display.bounds.height - 40 - 8,
        width: 200,
        height: 40
      }
      check('overlay bottom-right lands on the display\'s true edge, not the work-area-clamped one', await overlayBounds(app2), expected)
      await closeApp('overlay-taskbar', app2)
    }
  }

  console.log('\n=== O: bottom-anchored overlay clamps to the WORK AREA for a windowed game that does not reach the taskbar ===')
  {
    // Real bug, found live on the user's own machine (Forager, windowed):
    // the .bounds-only clamp above was right for a borderless/fullscreen
    // game covering the taskbar's strip, but wrong for an ordinary windowed
    // game that never reaches that edge — the overlay rendered ON TOP of the
    // real, still-visible taskbar instead of stopping above it. Fixed by
    // only trusting .bounds on whichever edge the game's own window actually
    // covers; this proves the .workArea side of that fix with a small
    // windowed game nowhere near any screen edge.
    const probe = await launch('display-probe-2', '', false)
    const display = await probe.app.evaluate(({ screen }) => {
      const d = screen.getPrimaryDisplay()
      return { bounds: d.bounds, workArea: d.workArea, physical: screen.dipToScreenRect(null, d.bounds) }
    })
    await closeApp('display-probe-2', probe.app)

    if (display.workArea.height >= display.bounds.height && display.workArea.width >= display.bounds.width) {
      console.log('  SKIP  this display reserves no taskbar strip — the bug is not exercisable here')
    } else {
      const physicalGame = {
        x: display.physical.x + 100,
        y: display.physical.y + 100,
        width: Math.min(800, Math.round(display.physical.width * 0.5)),
        height: Math.min(600, Math.round(display.physical.height * 0.5))
      }
      const WINDOWED_GAME = JSON.stringify({
        ExePath: 'C:\\Games\\FocusedGame\\game.exe',
        Title: 'Focused Game Windowed',
        X: physicalGame.x,
        Y: physicalGame.y,
        Width: physicalGame.width,
        Height: physicalGame.height
      })
      const { app: app3, win: win3 } = await launch('overlay-windowed', WINDOWED_GAME, true, 'bottom-right')
      await win3.waitForTimeout(2500) // overlayWindow polls every 2s
      const dipGame = await app3.evaluate(({ screen }, rect) => screen.screenToDipRect(null, rect), physicalGame)
      const expected = {
        x: Math.max(display.workArea.x, Math.min(dipGame.x + dipGame.width - 200 - 8, display.workArea.x + display.workArea.width - 200)),
        y: Math.max(display.workArea.y, Math.min(dipGame.y + dipGame.height - 40 - 8, display.workArea.y + display.workArea.height - 40)),
        width: 200,
        height: 40
      }
      check('overlay clamps to the work area, never covering the real taskbar', await overlayBounds(app3), expected)
      await closeApp('overlay-windowed', app3)
    }
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
