/*
 * Verifies the Simple/Advanced switch on Game Stats, and that More Info (K2)
 * ignores it entirely and always shows everything.
 *
 * Isolated save folder via the §7 GAMUT_TEST_APPDATA patch.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-detail-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const DATA = path.join(ROOT, 'game_timer_data.json')
const SHOTS = path.join(__dirname, '..', '.verify-shots')
const GAME = 'Finished Game'

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`
  )
}

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  fs.mkdirSync(SHOTS, { recursive: true })
  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {
        [GAME]: {
          name: GAME,
          seconds: 3600,
          status: 'completed',
          statusAt: '2026-03-15',
          statusSeconds: 3600,
          genres: ['Action'],
          startedDate: '2026-01-02',
          rating: 4,
          // Non-zero so the open/idle block has something to show.
          openSeconds: 5400,
          launches: 3,
          sessionStats: { count: 2, totalSeconds: 3600, longestSeconds: 2400, firstPlayedAt: 1, lastPlayedAt: 2 },
          sessionLog: [],
          activeSession: null
        }
      },
      lastSelected: GAME,
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

  const headers = async () => win.locator('table thead th').allTextContents()
  // The modal root, specifically — `.fixed` alone also matches the toast host.
  const infoText = async () => (await win.locator('div.z-50').first().textContent()) ?? ''

  /** Library can be showing either the grid or a game's detail page. */
  async function openMoreInfo() {
    await win.locator('button:has-text("Library")').first().click()
    await win.waitForTimeout(300)
    const back = win.locator('button:has-text("Back to Library")')
    if (await back.count()) {
      await back.first().click()
      await win.waitForTimeout(300)
    }
    await win.locator('[data-testid="library-item"]').first().click()
    await win.waitForTimeout(300)
    await win.locator('button:has-text("More info")').click()
    await win.waitForTimeout(500)
  }

  /** "Game Stats", specifically — Library and About never contain the word, but Profile Stats does. */
  async function openGameStats() {
    await win.locator('button:has-text("Game Stats")').first().click()
    await win.waitForTimeout(400)
  }

  console.log('\n=== Simple is the default, on Game Stats ===')
  await openGameStats()
  await win.screenshot({ path: path.join(SHOTS, '08-stats-simple.png') })
  const simpleCols = (await headers()).map((h) => h.replace(/[▲▼\s]+$/, '').trim())
  check('Simple hides Started', simpleCols.includes('Started'), false)
  check('Simple hides Completed On', simpleCols.includes('Completed On'), false)
  check('Simple hides Genres', simpleCols.includes('Genres'), false)
  check('Simple keeps Time to Beat', simpleCols.includes('Time to Beat'), true)
  check('Simple keeps Rating', simpleCols.includes('Rating'), true)

  console.log('\n=== K2: More Info ignores the switch and always shows everything ===')
  await openMoreInfo()
  let info = await infoText()
  // Guard against a silently empty selector making every check below pass.
  check('the info window was actually read', info.includes(GAME), true)
  check('Launches is shown even with Game Stats on Simple', info.includes('Launches'), true)
  check('Longest session is shown even with Game Stats on Simple', info.includes('Longest session'), true)
  check('the open/idle block is shown even with Game Stats on Simple', info.includes('Game was open'), true)
  check('Sessions is shown', info.includes('Sessions'), true)
  // 3600 tracked of 5400 open = 33% idle, 67% tracked, on one line.
  check('tracked and idle share a single line', /Tracked 67% · idle 33%/.test(info), true)
  await win.keyboard.press('Escape')
  await win.waitForTimeout(300)

  console.log('\n=== the switch itself lives on Game Stats, not Settings (F2) ===')
  await openGameStats()
  await win.locator('button:has-text("Advanced")').first().click()
  await win.waitForTimeout(500)

  await win.screenshot({ path: path.join(SHOTS, '09-stats-advanced.png') })
  const advCols = (await headers()).map((h) => h.replace(/[▲▼\s]+$/, '').trim())
  check('Advanced shows Started', advCols.includes('Started'), true)
  check('Advanced shows Completed On', advCols.includes('Completed On'), true)
  check('Advanced shows Genres', advCols.includes('Genres'), true)

  console.log('\n=== More Info is unaffected either way ===')
  await openMoreInfo()
  await win.screenshot({ path: path.join(SHOTS, '10-info-advanced.png') })
  info = await infoText()
  check('Launches still shown', info.includes('Launches'), true)
  check('the open/idle block still shown', info.includes('Game was open'), true)

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
