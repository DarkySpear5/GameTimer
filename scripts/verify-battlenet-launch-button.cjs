/*
 * Battle.net games (Y2): found live that neither the battlenet:// URI nor
 * Battle.net.exe's own --exec="launch_uid <code>" flag actually starts the
 * game — both just bring the client to the front. Since Gamut measurably
 * cannot launch these, the Launch button is hidden for them rather than
 * offering one that silently does the wrong thing. Stop must still work
 * normally if the game happens to be running (started by the user by hand).
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-battlenet-tmp')
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
        'Heroes of the Storm': game('Heroes of the Storm', {
          exePath: 'C:\\Program Files (x86)\\Heroes of the Storm\\Heroes of the Storm.exe',
          launchUri: 'battlenet://heroes'
        }),
        'Grim Dawn': game('Grim Dawn', {
          exePath: 'C:\\Games\\GrimDawn\\Grim Dawn.exe',
          installDir: 'C:\\Games\\GrimDawn'
        })
      },
      lastSelected: null,
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en' }
    })
  )
  return appDataRoot
}

async function launch(label) {
  const appDataRoot = seed(label)
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

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  ensureBundlePatched()

  console.log('\n=== Battle.net game: Launch button hidden, normal game: Launch button shown ===')
  {
    const { app, win } = await launch('bnet-vs-normal')

    await win.locator('text=Heroes of the Storm').click()
    await win.waitForTimeout(300)
    check('Launch button absent for a Battle.net game', await win.getByText('▶ Launch Game', { exact: true }).count(), 0)
    check('Stop button also absent (not running)', await win.getByText('⏹ Stop Game', { exact: true }).count(), 0)

    await win.getByText('← Back to Library', { exact: true }).click()
    await win.waitForTimeout(300)
    await win.locator('text=Grim Dawn').click()
    await win.waitForTimeout(300)
    check('Launch button present for a normal (non-Battle.net) game', await win.getByText('▶ Launch Game', { exact: true }).count(), 1)

    await closeApp(app)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
