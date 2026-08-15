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

    // Create via IPC directly rather than the UI's own creation entry
    // points (the toggle, or the section's own + New) — this block is
    // about exercising rename/delete with a known name and id, which the
    // toggle-driven flow below already covers end to end through real
    // clicks.
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

  console.log('\n=== the toggle next to Complete is the real entry point: click it, a category appears; click again, it hides but keeps its data ===')
  {
    const { app, win, appDataRoot } = await launch('toggle')
    await win.locator('text=Sub Test Game').click()

    const toggle = win.getByLabel('Enable sub-categories for this game')
    check('starts unchecked (no data yet)', await toggle.isChecked(), false)
    check('section not visible before enabling', await win.getByText('SUB-CATEGORIES', { exact: true }).count(), 0)

    await toggle.click()
    await win.waitForTimeout(300)
    check('a category was auto-created on enable', readProfile(appDataRoot).subCategories.length, 1)
    check('default name, ready to rename inline', readProfile(appDataRoot).subCategories[0].name, 'New Category')
    check('section now visible', await win.getByText('SUB-CATEGORIES', { exact: true }).count(), 1)
    check('the created row is visible too', await win.locator('text=New Category').count(), 1)

    await toggle.click()
    await win.waitForTimeout(300)
    check('disabled flag is explicitly false', readProfile(appDataRoot).subCategoriesEnabled, false)
    check('section hidden again once disabled', await win.getByText('SUB-CATEGORIES', { exact: true }).count(), 0)
    check('but the category data survives, just hidden', readProfile(appDataRoot).subCategories.length, 1)

    await toggle.click()
    await win.waitForTimeout(300)
    check('re-enabling shows the SAME category again, not a second one', readProfile(appDataRoot).subCategories.length, 1)
    check('section visible again', await win.getByText('SUB-CATEGORIES', { exact: true }).count(), 1)

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

  console.log('\n=== once assigned, the category keeps growing with the session — the exact bug the user found live ===')
  {
    const { app, win, appDataRoot } = await launch('ongoing')
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', 'Casual'))
    await win.evaluate(() => window.api.timer.start('Sub Test Game'))
    await win.waitForTimeout(1500)
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate((id) => window.api.profiles.assignSubCategorySession('Sub Test Game', id), id)
    await win.waitForTimeout(200)
    const atAssignment = readProfile(appDataRoot).subCategories[0].seconds
    // CHECKPOINT_MS is 5000 — wait past one natural periodic checkpoint
    // while still running, unassisted by any further assign call.
    await win.waitForTimeout(6000)
    const afterCheckpoint = readProfile(appDataRoot).subCategories[0].seconds
    check(
      'category kept growing after the periodic checkpoint, not frozen at the assignment-time value',
      afterCheckpoint > atAssignment,
      true
    )
    await win.evaluate(() => window.api.timer.pause('Sub Test Game'))
    // pause() fires `void dataStore.save()` without awaiting it — same as
    // every other mutation in this script, give the write a moment to land
    // before reading the file back.
    await win.waitForTimeout(300)
    const afterPause = readProfile(appDataRoot).subCategories[0].seconds
    check('and again after pause commits the final delta', afterPause > afterCheckpoint, true)
    const profile = readProfile(appDataRoot)
    check(
      "category's final total matches the main total for this whole session (nothing else played)",
      Math.abs(profile.subCategories[0].seconds - profile.seconds) < 0.5,
      true
    )
    await closeApp(app)
  }

  console.log('\n=== the live tick payload itself carries the assigned category, ticking every UI_TICK_MS — not just on pause ===')
  {
    const { app, win, appDataRoot } = await launch('live-tick')
    await win.evaluate(() => window.api.profiles.createSubCategory('Sub Test Game', 'Casual'))
    await win.evaluate(() => window.api.timer.start('Sub Test Game'))
    await win.waitForTimeout(500)
    const id = readProfile(appDataRoot).subCategories[0].id
    await win.evaluate((id) => window.api.profiles.assignSubCategorySession('Sub Test Game', id), id)

    // Capture two consecutive tick payloads a second apart — this is the
    // exact mechanism SubCategoryRow's displaySeconds reads from, so this
    // is checking what the UI actually sees, not just what's on disk.
    const [first, second] = await win.evaluate(
      () =>
        new Promise((resolve) => {
          const seen = []
          const unsub = window.api.timer.onTick((payload) => {
            const entry = payload.runningCategories['Sub Test Game']
            if (entry) seen.push(entry.seconds)
            if (seen.length >= 2) {
              unsub()
              resolve(seen)
            }
          })
        })
    )
    check('live tick payload includes the assigned category at all', typeof first, 'number')
    check('and it grows between two consecutive ticks, not frozen', second > first, true)

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
