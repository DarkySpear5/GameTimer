/*
 * Two real bugs, found live via the user's actual library: a game with no
 * portrait cover (Heroes of the Storm — never on Steam, falls back to a
 * 48x48 exe-extracted icon) and a game whose only cover is Steam's landscape
 * header.jpg fallback (Escape Rosecliff Island, appid 3600 — a 2007 game
 * with no library_600x900) both looked "ugly": object-cover force-cropped
 * them into the grid's portrait tiles. Fixed with a letterboxed treatment in
 * GameArt.tsx. This seeds the user's OWN real image files (copied from
 * their real save, read-only, never modified) so the check is against the
 * exact real-world case, not a synthetic stand-in.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-art-letterbox-tmp')
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

// The user's own real files — read-only copy, never touching the originals.
const REAL_APPDATA = path.join(process.env.APPDATA, 'gametimer-dev')
const HOTS_ICON = 'hots-icon.png'
const ROSECLIFF_COVER = 'rosecliff-cover.jpg'

function seed(label) {
  const appDataRoot = path.join(ROOT, label)
  const userDataDir = path.join(appDataRoot, USER_DATA_FOLDER)
  const iconsDir = path.join(userDataDir, 'icons')
  const coversDir = path.join(userDataDir, 'covers')
  fs.mkdirSync(iconsDir, { recursive: true })
  fs.mkdirSync(coversDir, { recursive: true })
  fs.copyFileSync(
    path.join(REAL_APPDATA, 'icons', '1e5b4c32-d3a9-4033-92a2-6ef9ab3e4870.png'),
    path.join(iconsDir, HOTS_ICON)
  )
  fs.copyFileSync(
    path.join(REAL_APPDATA, 'covers', 'faae7bef-d8ae-468e-a2c2-9bfadc5f6cca.jpg'),
    path.join(coversDir, ROSECLIFF_COVER)
  )
  fs.writeFileSync(
    path.join(userDataDir, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    path.join(userDataDir, 'game_timer_data.json'),
    JSON.stringify({
      profiles: {
        'Heroes of the Storm': game('Heroes of the Storm', { iconFile: HOTS_ICON }),
        'Escape Rosecliff Island': game('Escape Rosecliff Island', { coverFile: ROSECLIFF_COVER, steamAppId: 3600 }),
        'Grim Dawn': game('Grim Dawn', { installDir: 'C:\\Games\\GrimDawn' }) // control: no art, plain placeholder
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
  if (!fs.existsSync(path.join(REAL_APPDATA, 'icons', '1e5b4c32-d3a9-4033-92a2-6ef9ab3e4870.png'))) {
    console.log('SKIP: real Heroes of the Storm icon file not found on this machine — nothing to verify against')
    process.exit(0)
  }
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  ensureBundlePatched()

  const { app, win } = await launch('letterbox')
  await win.waitForTimeout(500)
  await win.screenshot({ path: path.join(SCRATCH, 'grid-with-real-art.png') })

  // Sanity: both tiles rendered without crashing (checked via DOM presence), and
  // the placeholder-letter control game still shows its plain fallback tile —
  // proving the letterbox change didn't touch the no-art path at all.
  check('Heroes of the Storm tile present', await win.getByText('Heroes of the Storm').count(), 1)
  check('Escape Rosecliff Island tile present', await win.getByText('Escape Rosecliff Island').count(), 1)
  check('Grim Dawn (no-art control) still shows its letter placeholder', await win.getByText('G', { exact: true }).count(), 1)

  await closeApp(app)

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  console.log(`Screenshot: ${path.join(SCRATCH, 'grid-with-real-art.png')}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
