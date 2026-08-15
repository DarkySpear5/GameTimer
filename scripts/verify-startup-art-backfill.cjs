/*
 * "Auto fetch art on Gamut launch" — backfillMissingCoverArt (enrich.ts),
 * fired once at startup for any profile with no cover yet. This verifies
 * the SAFETY gating (the part that must never go wrong), not the network
 * fetch itself — real art-source success/failure isn't deterministic in a
 * test environment, but "never touches a profile with existing art or
 * autoFetchArt off" is, and is the property that actually matters: this
 * runs unattended on every single launch, so a mistake here would silently
 * clobber art on every real user's machine, every time they open the app.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-startup-art-tmp')
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

function seed(label, settingsAutoFetchArt) {
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
        // Off via the per-profile override — must never be touched even though
        // the global setting below is on.
        'Opted Out Game': game('Opted Out Game', { autoFetchArt: false, exePath: 'C:\\Games\\OptedOut\\game.exe' }),
        // Already has a cover — must never be touched, even a fake/nonsense
        // one: this is the one signal that must always mean "leave it alone".
        'Already Has Art': game('Already Has Art', { coverFile: 'user-chosen-cover.jpg' }),
        // The one candidate that should actually attempt a fetch.
        'Missing Cover': game('Missing Cover', { exePath: 'C:\\Games\\Missing\\game.exe' })
      },
      lastSelected: null,
      settings: {
        trayEnabled: false,
        checkForUpdates: false,
        language: 'en',
        autoFetchArt: settingsAutoFetchArt
      }
    })
  )
  return appDataRoot
}

async function launch(label, settingsAutoFetchArt) {
  const appDataRoot = seed(label, settingsAutoFetchArt)
  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, GAMUT_TEST_APPDATA: appDataRoot }
  })
  const win = await app.firstWindow()
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

const readProfiles = (appDataRoot) =>
  JSON.parse(fs.readFileSync(path.join(appDataRoot, USER_DATA_FOLDER, 'game_timer_data.json'), 'utf8')).profiles

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  ensureBundlePatched()

  console.log('\n=== global autoFetchArt OFF: nothing gets touched at all, even the missing-cover candidate ===')
  {
    const { app, appDataRoot } = await launch('global-off', false)
    await new Promise((r) => setTimeout(r, 3000)) // give the (should-be-skipped) backfill a real chance to run
    const profiles = readProfiles(appDataRoot)
    check('opted-out game untouched', profiles['Opted Out Game'].coverFile, null)
    check('already-has-art game untouched', profiles['Already Has Art'].coverFile, 'user-chosen-cover.jpg')
    check('missing-cover game left alone (global setting off)', profiles['Missing Cover'].coverFile, null)
    await closeApp(app)
  }

  console.log('\n=== global autoFetchArt ON: per-profile opt-out and existing art are still never touched ===')
  {
    const { app, appDataRoot } = await launch('global-on', true)
    await new Promise((r) => setTimeout(r, 5000)) // let the real candidate's fetch attempt actually finish
    const profiles = readProfiles(appDataRoot)
    check('opted-out game STILL untouched despite the global default', profiles['Opted Out Game'].coverFile, null)
    check(
      'already-has-art game STILL untouched — the one property that must never break',
      profiles['Already Has Art'].coverFile,
      'user-chosen-cover.jpg'
    )
    // Deliberately NOT asserting Missing Cover's final coverFile value here —
    // whether the fetch actually finds art depends on real network access
    // and Steam/GOG/SteamGridDB having something for a fake game name, which
    // this script has no control over. The two checks above are the ones
    // that must hold regardless of network conditions.
    await closeApp(app)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
