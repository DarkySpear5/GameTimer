/*
 * Two real bugs found live, both in gameWatcher.ts's background poll:
 *   1. Launch/Stop button never flipped for a self-launched game — `touched`
 *      was only set in the non-self-launched branch of the "just opened"
 *      case, so the openGamesChanged broadcast never fired for the common
 *      case (Gamut launched the game itself).
 *   2. Displayed playtime reverted to a stale value after the game closed —
 *      no push path existed for a profile field (`seconds`) changed by a
 *      MAIN-process-initiated action (auto-pause) rather than a
 *      renderer-initiated one; only a full app relaunch re-fetched it.
 *
 * Uses a REAL spawned process (notepad.exe) as the stand-in "game" so
 * gameWatcher's actual Get-Process-based detection has something genuine to
 * find and lose — not a faked foreground window, since this exercises the
 * BACKGROUND poll (watchForGames), a completely different code path from
 * M/N/O's foreground-focus detection. Modern Windows Notepad is UWP-hosted:
 * the PID spawn() hands back doesn't match the real, persistent process, so
 * both resolving its path and killing it go by NAME, with retries.
 */
const fs = require('fs')
const path = require('path')
const { execFile, spawn } = require('child_process')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-gamewatcher-tmp')
const USER_DATA = path.join(SCRATCH, 'gametimer')
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
    openSeconds: 0, secondsAtOpenTrackingStart: null, openSecondsAtOpenTrackingStart: null,
    autoStartTimer: null, genresFromDetection: false,
    favorite: false, coverFile: null, subCategories: [], subCategoriesEnabled: null, ...extra
  }
}

function ensureBundlePatched() {
  const original = fs.readFileSync(BUNDLE, 'utf8')
  const patched = 'process.env.GAMUT_TEST_APPDATA || electron.app.getPath("appData")'
  if (original.includes(patched)) return
  fs.writeFileSync(BUNDLE, original.replace('electron.app.getPath("appData")', `(${patched})`))
}

async function resolveNotepadPath() {
  spawn('notepad.exe', [], { detached: true, stdio: 'ignore' })
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '(Get-Process -Name Notepad -ErrorAction SilentlyContinue | Select-Object -First 1).Path'
    ])
    const found = stdout.trim()
    if (found) return found
  }
  throw new Error('Could not resolve a running Notepad.exe path after retrying')
}

;(async () => {
  const notepadPath = await resolveNotepadPath()

  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(USER_DATA, { recursive: true })
  fs.writeFileSync(
    path.join(USER_DATA, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    path.join(USER_DATA, 'game_timer_data.json'),
    JSON.stringify({
      profiles: { 'Notepad Test': game('Notepad Test', { exePath: notepadPath }) },
      lastSelected: null,
      settings: {
        trayEnabled: false, checkForUpdates: false, language: 'en', autoFetchArt: false,
        watchForGames: true, autoStartTimer: true
      }
    })
  )
  ensureBundlePatched()

  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, GAMUT_TEST_APPDATA: SCRATCH }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1000)

  await win.locator('[data-testid="library-item"]:has-text("Notepad Test")').click()
  await win.waitForTimeout(500)

  const dataFile = path.join(USER_DATA, 'game_timer_data.json')
  const readProfile = () => JSON.parse(fs.readFileSync(dataFile, 'utf8')).profiles['Notepad Test']

  console.log('\n=== gameWatcher detects the real process opening ===')
  let opened = false
  for (let i = 0; i < 12 && !opened; i++) {
    await win.waitForTimeout(1000)
    opened = await win.locator('button:has-text("Stop Game")').isVisible().catch(() => false)
  }
  check('Launch/Stop button flips to Stop Game', opened, true)
  check('timer auto-started', readProfile().activeSession !== null, true)
  // Idle-tracking bug #3: baselining lazily inside the openSeconds-credit
  // call (which only ever runs at CLOSE) meant a fresh profile's baseline
  // was captured at the END of its first session, swallowing almost all of
  // it into "already accounted for". Baselining at session START instead
  // (noteLaunched, synchronously) means a freshly-launched profile's
  // baseline is 0/0 from the very first moment it's visible on disk.
  check(
    'idle baseline captured at launch, not deferred to close',
    { s: readProfile().secondsAtOpenTrackingStart, o: readProfile().openSecondsAtOpenTrackingStart },
    { s: 0, o: 0 }
  )

  await win.waitForTimeout(2000) // let a few real seconds accrue before closing
  await execFileAsync('taskkill', ['/F', '/IM', 'Notepad.exe']).catch(() => {})

  console.log('\n=== gameWatcher detects the real process closing ===')
  let closed = false
  for (let i = 0; i < 12 && !closed; i++) {
    await win.waitForTimeout(1000)
    closed = await win.locator('button:has-text("Launch Game")').isVisible().catch(() => false)
  }
  check('Launch/Stop button flips back to Launch Game', closed, true)

  await win.waitForTimeout(500)
  const shownTime = (await win.locator('.font-mono.text-4xl').first().textContent().catch(() => '')).trim()
  const finalProfile = readProfile()
  const onDiskSeconds = finalProfile.seconds
  check('time was actually recorded on disk', onDiskSeconds > 0, true)
  check('UI shows the real elapsed time without a reload (not stale/00:00:00)', shownTime !== '00:00:00', true)
  // The actual reported bug: autoStartTimer was on the whole session (the
  // timer ran continuously alongside openSeconds), so real idle time is
  // ~0 here — NOT the ~100% a late-baselined session would wrongly show.
  const activeSinceBaseline = finalProfile.seconds - finalProfile.secondsAtOpenTrackingStart
  const openSinceBaseline = finalProfile.openSeconds - finalProfile.openSecondsAtOpenTrackingStart
  const idleSeconds = Math.max(0, openSinceBaseline - activeSinceBaseline)
  console.log(`  seconds=${finalProfile.seconds} openSeconds=${finalProfile.openSeconds} idleSeconds=${idleSeconds}`)
  check('idle time stays near zero for a session the timer ran throughout', idleSeconds <= 2, true)

  const pid = app.process().pid
  await new Promise((r) => execFile('taskkill', ['/F', '/T', '/PID', String(pid)], () => r()))
  await execFileAsync('taskkill', ['/F', '/IM', 'Notepad.exe']).catch(() => {})

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
