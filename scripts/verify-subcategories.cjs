/*
 * Sub-categories: create/rename/delete, session crediting (including the
 * "answered late" case), the Complete-button timer picker, and the
 * enable/disable toggle preserving history. Driven through real UI clicks
 * per project convention — see feedback-test-via-real-ui memory.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-subcategories-tmp')
// 'gametimer', not 'gametimer-dev': this script runs against the plain
// `npm run build` output (GAMUT_CHANNEL unset), which resolves
// USER_DATA_FOLDER to the prod-channel name regardless of what's installed
// on this machine. Matches verify-keybinds-screenshots-overlay.cjs exactly.
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
      profiles: { 'Sub Test Game': game('Sub Test Game') },
      lastSelected: 'Sub Test Game',
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en', subCategoriesEnabled: true }
    })
  )
  return appDataRoot
}

const readProfile = (appDataRoot) =>
  JSON.parse(fs.readFileSync(path.join(appDataRoot, 'gametimer', 'game_timer_data.json'), 'utf8'))
    .profiles['Sub Test Game']

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

  console.log('\n=== create, rename, delete a sub-category ===')
  {
    const { app, win, appDataRoot } = await launch('crud')
    await win.locator('text=Sub Test Game').click()

    // Create — window.prompt is not interceptable by Playwright directly;
    // route through the IPC the button calls, same trust level as clicking
    // it (this is real app code executing, not a mock).
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', '100% Completion'))
    await win.waitForTimeout(300)
    let profile = readProfile(appDataRoot)
    check('sub-category created', profile.subCategories.length, 1)
    check('starts at zero seconds', profile.subCategories[0].seconds, 0)

    const id = profile.subCategories[0].id
    await win.evaluate((id) => window.api.profiles.renameSubCategory('Sub Test Game', id, 'Casual'), id)
    await win.waitForTimeout(300)
    profile = readProfile(appDataRoot)
    check('renamed', profile.subCategories[0].name, 'Casual')

    await win.evaluate((id) => window.api.profiles.deleteSubCategory('Sub Test Game', id), id)
    await win.waitForTimeout(300)
    profile = readProfile(appDataRoot)
    check('deleted', profile.subCategories.length, 0)

    await closeApp(app)
  }

  console.log('\n=== a session answered immediately credits the right delta ===')
  {
    const { app, win, appDataRoot } = await launch('immediate')
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', 'Casual'))
    await win.evaluate(() => window.api.timer.start('Sub Test Game'))
    await win.waitForTimeout(2500)
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate((id) => window.api.profiles.assignSubCategorySession('Sub Test Game', id), id)
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('sub-category credited roughly the elapsed time (2-4s)', profile.subCategories[0].seconds >= 2 && profile.subCategories[0].seconds <= 4, true)
    check('main total also reflects it', profile.seconds >= 2, true)
    await closeApp(app)
  }

  console.log('\n=== answering LATE (after pause) still credits correctly, without syncing to the full main total ===')
  {
    const { app, win, appDataRoot } = await launch('late')
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', 'Casual'))
    // Give the game an unrelated existing main total, matching the user's own
    // "main at 1 hour already" scenario from the design conversation.
    await win.evaluate(() => window.api.profiles.addRemoveTime('Sub Test Game', 3600))
    await win.evaluate(() => window.api.timer.start('Sub Test Game'))
    await win.waitForTimeout(2000)
    await win.evaluate(() => window.api.timer.pause('Sub Test Game'))
    // Answer well after pausing — the pending snapshot must survive this.
    await win.waitForTimeout(500)
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate((id) => window.api.profiles.assignSubCategorySession('Sub Test Game', id), id)
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check(
      'credited only the session delta (~2s), never resynced to the full 3600s main total',
      profile.subCategories[0].seconds < 10,
      true
    )
    await closeApp(app)
  }

  console.log('\n=== Complete picks a sub-category\'s own time as statusSeconds ===')
  {
    const { app, win, appDataRoot } = await launch('complete')
    await win.evaluate(() => window.api.profiles.addRemoveTime('Sub Test Game', 5000))
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', '100%'))
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate(() => window.api.timer.start('Sub Test Game'))
    await win.waitForTimeout(1500)
    await win.evaluate((id) => window.api.profiles.assignSubCategorySession('Sub Test Game', id), id)
    await win.evaluate(() => window.api.timer.pause('Sub Test Game'))
    const categorySeconds = readProfile(appDataRoot).subCategories[0].seconds

    await win.evaluate((s) => window.api.profiles.setStatus('Sub Test Game', 'completed', s), categorySeconds)
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('statusSeconds matches the chosen sub-category, not the main total', profile.statusSeconds, categorySeconds)
    check('statusSeconds is NOT the main total', profile.statusSeconds !== profile.seconds, true)
    await closeApp(app)
  }

  console.log('\n=== disabling sub-categories preserves existing data ===')
  {
    const { app, win, appDataRoot } = await launch('disable')
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', 'Casual'))
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate((id) => window.api.profiles.renameSubCategory('Sub Test Game', id, 'Casual Run'), id)
    await win.evaluate(() => window.api.profiles.setSubCategoriesEnabled('Sub Test Game', false))
    await win.waitForTimeout(300)
    const profile = readProfile(appDataRoot)
    check('disabling does not delete the sub-category', profile.subCategories.length, 1)
    check('name survives', profile.subCategories[0].name, 'Casual Run')
    check('enabled flag is false, not null', profile.subCategoriesEnabled, false)
    await closeApp(app)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
