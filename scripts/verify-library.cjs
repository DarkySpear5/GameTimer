/*
 * Drives the Library redesign through the real UI, in an isolated save folder.
 *
 * Requires the GAMUT_TEST_APPDATA patch from the roadmap's §7 to have been
 * applied to out/main/index.js after building — without it this would read and
 * write the user's REAL library, because src/main/index.ts pins userData onto
 * app.getPath('appData') regardless of how the process was launched.
 *
 * Everything here goes through clicks rather than window.api.*: calling IPC
 * directly bypasses the renderer's Zustand sync, so the store never learns
 * about the change and the UI shows nothing.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-library-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const DATA = path.join(ROOT, 'game_timer_data.json')
const SHOTS = path.join(__dirname, '..', '.verify-shots')

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`
  )
}

const readProfiles = () => JSON.parse(fs.readFileSync(DATA, 'utf8')).profiles

function game(name, seconds, extra = {}) {
  return {
    name,
    seconds,
    iconFile: null,
    bgColor: null,
    bgImage: null,
    status: 'in_progress',
    statusAt: null,
    statusSeconds: null,
    genres: [],
    lastPlayed: null,
    startedDate: null,
    notes: '',
    rating: 0,
    sessionLog: [],
    ...extra
  }
}

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  // Deliberately NOT wiped: the other verify scripts write into the same
  // folder, and running the suites in sequence used to leave only this one's
  // screenshots behind.
  fs.mkdirSync(SHOTS, { recursive: true })
  // Both first-run offers marked as already made — this script is about the
  // Library, and either prompt would sit over it intercepting clicks. The
  // installed-games offer is covered by verify-installed.cjs.
  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {
        'Alpha Quest': game('Alpha Quest', 100),
        'Beta Run': game('Beta Run', 900, { favorite: true }),
        'Gamma Tale': game('Gamma Tale', 500)
      },
      lastSelected: null,
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en', autoFetchArt: false }
    })
  )

  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, GAMUT_TEST_APPDATA: SCRATCH }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1800)

  const tileNames = async () =>
    win.locator('[data-testid="library-item"] [data-testid="library-item-name"]').allTextContents()

  console.log('\n=== Library is the default tab and shows every game ===')
  await win.screenshot({ path: path.join(SHOTS, '01-library-grid.png') })
  check('Library toolbar is present', await win.locator('text=Sort').first().isVisible(), true)
  check('all three games are listed', (await tileNames()).sort(), ['Alpha Quest', 'Beta Run', 'Gamma Tale'])

  console.log('\n=== clicking a game opens its detail page, and does nothing else ===')
  await win.locator('[data-testid="library-item"]:has-text("Gamma Tale")').click()
  await win.waitForTimeout(400)
  await win.screenshot({ path: path.join(SHOTS, '02-library-detail.png') })
  check('detail page is open', await win.locator('text=Back to Library').first().isVisible(), true)
  // The whole point of the decision: a click browses, it does not act.
  check('no timer was started', readProfiles()['Gamma Tale'].seconds, 500)
  check('the Timer tab was not switched to', await win.locator('text=Back to Library').first().isVisible(), true)

  console.log('\n=== the star toggles and persists ===')
  await win.locator('button[aria-label="Add to Favorites"]').first().click()
  await win.waitForTimeout(600)
  check('Gamma Tale is now a favourite on disk', readProfiles()['Gamma Tale'].favorite, true)
  await win.locator('button[aria-label="Remove from Favorites"]').first().click()
  await win.waitForTimeout(600)
  check('and un-favouriting persists too', readProfiles()['Gamma Tale'].favorite, false)

  console.log('\n=== back returns to the collection ===')
  await win.locator('text=Back to Library').first().click()
  await win.waitForTimeout(400)
  check('grid is back', (await tileNames()).length, 3)

  console.log('\n=== sorting reorders the grid ===')
  await win.locator('select').nth(0).selectOption('playtime')
  await win.waitForTimeout(400)
  check('sorted by hours played', await tileNames(), ['Beta Run', 'Gamma Tale', 'Alpha Quest'])
  await win.locator('select').nth(0).selectOption('name_desc')
  await win.waitForTimeout(400)
  check('sorted Z-A', await tileNames(), ['Gamma Tale', 'Beta Run', 'Alpha Quest'])
  await win.locator('select').nth(0).selectOption('favorite')
  await win.waitForTimeout(400)
  check('favourites first', await tileNames(), ['Beta Run', 'Alpha Quest', 'Gamma Tale'])

  console.log('\n=== the list view is the same collection, differently shaped ===')
  await win.locator('button:has-text("List")').first().click()
  await win.waitForTimeout(400)
  await win.screenshot({ path: path.join(SHOTS, '03-library-list.png') })
  check('list still shows every game', (await tileNames()).length, 3)

  console.log('\n=== the Timer tab still works, with its own list ===')
  await win.locator('button:has-text("Timer")').first().click()
  await win.waitForTimeout(400)
  await win.screenshot({ path: path.join(SHOTS, '04-timer.png') })
  check(
    'timer tab shows the empty-selection prompt',
    await win.locator('text=No profile selected').first().isVisible(),
    true
  )
  // Library owns browsing, so the Timer sidebar has no sort/filter controls of
  // its own — it is a switcher, not a second place to manage the collection.
  check('timer sidebar has no dropdowns', await win.locator('aside select, .bg-panel select').count(), 0)

  console.log('\n=== Stats tab renders with the renamed column ===')
  await win.locator('button:has-text("Stats")').first().click()
  await win.waitForTimeout(400)
  await win.screenshot({ path: path.join(SHOTS, '05-stats.png') })
  check('Time to Beat column is present', await win.locator('text=Time to Beat').first().isVisible(), true)

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
