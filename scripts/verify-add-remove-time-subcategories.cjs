/*
 * Add/Remove Time now also credits sub-categories (previously it only ever
 * touched the main total, on both add AND remove — the bug the user's
 * girlfriend found), and the Time tab is now a two-step flow. Driven
 * through the real UI (buttons, inputs, checkboxes) per
 * feedback-test-via-real-ui — sub-categories are created via the real
 * toggle/"+ New" button, never raw IPC, because a category created via
 * window.api.profiles.createSubCategory() directly never reaches the
 * renderer's Zustand store, and TimeTab reads profile.subCategories from
 * that same store to decide whether to show step 2 at all. Raw IPC is only
 * used to pre-load a `seconds` total on categories that already exist.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-add-remove-time-subcategories-tmp')
// 'gametimer', not 'gametimer-dev': this script runs against the plain
// `npm run build` output (GAMUT_CHANNEL unset), which resolves
// USER_DATA_FOLDER to the prod-channel name regardless of what's installed
// on this machine. Matches verify-subcategories.cjs exactly.
const ROOT = path.join(SCRATCH, 'gametimer')
const BUNDLE = path.join(__dirname, '..', 'out', 'main', 'index.js')

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
  const userDataDir = path.join(appDataRoot, 'gametimer')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(path.join(userDataDir, 'firstrun.json'), JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' }))
  fs.writeFileSync(
    path.join(userDataDir, 'game_timer_data.json'),
    JSON.stringify({
      profiles: { 'Time Test Game': game('Time Test Game') },
      lastSelected: 'Time Test Game',
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en', subCategoriesEnabled: true }
    })
  )
  return appDataRoot
}

const readProfile = (appDataRoot) =>
  JSON.parse(fs.readFileSync(path.join(appDataRoot, 'gametimer', 'game_timer_data.json'), 'utf8'))
    .profiles['Time Test Game']

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

async function selectGame(win) {
  await win.locator('text=Time Test Game').click()
}

/** Opens Modify and switches to the Time tab. Call selectGame first. */
async function openTimeTab(win) {
  await win.getByText('Modify', { exact: true }).click()
  await win.getByText('Time', { exact: true }).click()
  await win.waitForTimeout(200)
}

/** Creates the game's first sub-category via the real enable toggle. */
async function enableSubCategories(win) {
  await win.getByLabel('Enable sub-categories for this game').click()
  await win.waitForTimeout(300)
}

/** Creates a second sub-category via the real "+ New" button (only visible once the section is showing). */
async function addAnotherCategory(win) {
  await win.getByText('+ New', { exact: true }).click()
  await win.waitForTimeout(300)
}

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  ensureBundlePatched()

  console.log('\n=== zero sub-categories: step 1\'s button applies directly, step 2 never appears ===')
  {
    const { app, win, appDataRoot } = await launch('no-subcats')
    await selectGame(win)
    await openTimeTab(win)
    check('button reads Apply, not Continue, with no sub-categories', await win.getByText('Apply', { exact: true }).count(), 1)
    await win.getByLabel('Hours').fill('1')
    await win.getByText('Apply', { exact: true }).click()
    await win.waitForTimeout(300)
    check('step 2 never rendered', await win.getByText('Select all', { exact: true }).count(), 0)
    const profile = readProfile(appDataRoot)
    check('main gained the full amount', profile.seconds, 3600)
    check('no sub-categories exist to touch', profile.subCategories.length, 0)
    await closeApp(app)
  }

  console.log('\n=== adding time credits main AND every ticked sub-category by the same amount ===')
  {
    const { app, win, appDataRoot } = await launch('add-ticked')
    await selectGame(win)
    await enableSubCategories(win)
    await addAnotherCategory(win)
    check('two categories exist before the test action', readProfile(appDataRoot).subCategories.length, 2)

    await openTimeTab(win)
    await win.getByLabel('Hours').fill('1')
    await win.getByText('Continue →', { exact: true }).click()
    await win.waitForTimeout(200)
    check('step 2 shows the validated amount', await win.getByText('+01:00:00', { exact: true }).count(), 1)
    const modal = win.locator('.fixed.inset-0.z-50')
    // Tick only the first category (created via the toggle) — the second must not move.
    await modal.locator('input[type="checkbox"]').nth(0).check()
    await win.getByText('Apply', { exact: true }).click()
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('main gained the full amount', profile.seconds, 3600)
    check('ticked category gained the same amount', profile.subCategories[0].seconds, 3600)
    check('untouched category stayed at zero', profile.subCategories[1].seconds, 0)
    await closeApp(app)
  }

  console.log('\n=== removing time debits main AND every ticked sub-category — the exact bug the girlfriend found ===')
  {
    const { app, win, appDataRoot } = await launch('remove-all-ticked')
    await selectGame(win)
    await enableSubCategories(win)
    await addAnotherCategory(win)
    const ids = readProfile(appDataRoot).subCategories.map((c) => c.id)
    check('two categories exist before the test action', ids.length, 2)
    // Setup only, via IPC (see feedback-test-via-real-ui): give main and both
    // categories a known starting total. Safe here — it only changes
    // `seconds` on categories the renderer already knows exist, it doesn't
    // need the renderer to learn about anything NEW.
    await win.evaluate((ids) => window.api.profiles.addRemoveTime('Time Test Game', 3600, ids), ids)
    await win.waitForTimeout(300)
    check('setup: both categories credited by the add', readProfile(appDataRoot).subCategories.every((c) => c.seconds === 3600), true)

    await openTimeTab(win)
    await win.getByText('Remove', { exact: true }).click()
    await win.getByLabel('Minutes').fill('20')
    await win.getByText('Continue →', { exact: true }).click()
    await win.waitForTimeout(200)
    check('step 2 shows the validated removal amount', await win.getByText('−00:20:00', { exact: true }).count(), 1)
    await win.getByText('Select all', { exact: true }).click()
    await win.getByText('Apply', { exact: true }).click()
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('main lost the removed amount', profile.seconds, 2400)
    check('both ticked categories lost the same amount', profile.subCategories.every((c) => c.seconds === 2400), true)
    await closeApp(app)
  }

  console.log('\n=== removing more than a sub-category has clamps that category at zero, independent of main ===')
  {
    const { app, win, appDataRoot } = await launch('over-remove')
    await selectGame(win)
    await enableSubCategories(win)
    const id = readProfile(appDataRoot).subCategories[0].id
    // Setup only, via IPC: main starts with a large history; the category
    // only has a small amount — the over-removal itself happens via the UI below.
    await win.evaluate(() => window.api.profiles.addRemoveTime('Time Test Game', 7200))
    await win.evaluate((id) => window.api.profiles.addRemoveTime('Time Test Game', 300, [id]), id)
    await win.waitForTimeout(300)
    check('setup: category has its small amount before the over-removal', readProfile(appDataRoot).subCategories[0].seconds, 300)

    await openTimeTab(win)
    await win.getByText('Remove', { exact: true }).click()
    await win.getByLabel('Hours').fill('1')
    await win.getByText('Continue →', { exact: true }).click()
    await win.waitForTimeout(200)
    const modal = win.locator('.fixed.inset-0.z-50')
    await modal.locator('input[type="checkbox"]').nth(0).check()
    await win.getByText('Apply', { exact: true }).click()
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('category clamped at zero rather than going negative', profile.subCategories[0].seconds, 0)
    check('main still lost the FULL requested amount, unaffected by the category clamp', profile.seconds, 3900)
    await closeApp(app)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
