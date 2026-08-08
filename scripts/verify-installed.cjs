/*
 * Verifies the installed-games scan against THIS machine's real Steam library.
 *
 * The scan is deliberately not mocked — the whole feature is "what is actually
 * on this PC", and the two bugs it has already caught (every game listed twice
 * because the registry and libraryfolders.vdf disagree about capitalisation,
 * and Steamworks Common Redistributables presenting as a game) were both only
 * visible against real data.
 *
 * Writes go to an isolated save folder via the §7 GAMUT_TEST_APPDATA patch, so
 * nothing here touches the user's real library.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-installed-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const DATA = path.join(ROOT, 'game_timer_data.json')
const FIRSTRUN = path.join(ROOT, 'firstrun.json')
const SHOTS = path.join(__dirname, '..', '.verify-shots')

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`
  )
}
function report(label, value) {
  console.log(`  ..    ${label}: ${value}`)
}

const readData = () => JSON.parse(fs.readFileSync(DATA, 'utf8'))

function seed() {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  // legacyImportState present so the v1 prompt stays out of the way;
  // installedScanState absent, which is exactly "this offer has not been made".
  fs.writeFileSync(FIRSTRUN, JSON.stringify({ legacyImportState: 'skipped' }))
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {},
      lastSelected: null,
      // Art off: this test is about which games are found, and fetching covers
      // for a dozen games would make it slow and network-dependent.
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en', autoFetchArt: false }
    })
  )
}

const launch = () =>
  electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, GAMUT_TEST_APPDATA: SCRATCH }
  })

;(async () => {
  fs.mkdirSync(SHOTS, { recursive: true })
  seed()

  let app = await launch()
  let win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(2500)

  console.log('\n=== the offer is made once, unprompted, on first run ===')
  const dialogVisible = await win.locator('text=Add the games on this PC?').first().isVisible()
  check('first-run scan dialog appeared', dialogVisible, true)
  await win.screenshot({ path: path.join(SHOTS, '06-installed-scan.png') })

  const rows = await win.locator('label:has(input[type="checkbox"]) span').first().isVisible()
  check('the list rendered', rows, true)

  const names = await win
    .locator('label:has(input[type="checkbox"])')
    .evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.trim() ?? ''))
  report(`${names.length} entries found`, names.join(', '))

  console.log('\n=== what the scan must not contain ===')
  check(
    'no Steamworks Common Redistributables',
    names.some((n) => /steamworks common/i.test(n)),
    false
  )
  check('no duplicate entries', names.length, new Set(names).size)

  console.log('\n=== importing adds games at zero playtime ===')
  await win.locator('button:has-text("Select none")').click()
  await win.waitForTimeout(200)
  const boxes = win.locator('label:has(input[type="checkbox"]) input')
  await boxes.nth(0).check()
  await boxes.nth(1).check()
  await win.waitForTimeout(200)
  await win.locator('button:has-text("Add 2 games")').click()
  await win.waitForTimeout(3000)

  const imported = readData().profiles
  const importedNames = Object.keys(imported)
  check('exactly two games were added', importedNames.length, 2)
  check(
    'both start at zero seconds',
    importedNames.every((n) => imported[n].seconds === 0),
    true
  )
  check(
    'both carry a steam appid, so they can launch and fetch art',
    importedNames.every((n) => typeof imported[n].steamAppId === 'number'),
    true
  )
  report('added', importedNames.join(', '))

  const firstRun = JSON.parse(fs.readFileSync(FIRSTRUN, 'utf8'))
  check('the offer is recorded as made', firstRun.installedScanState, 'imported')
  check('and the v1 import record survived it', firstRun.legacyImportState, 'skipped')

  await app.close()
  await new Promise((r) => setTimeout(r, 1200))

  console.log('\n=== it does not ask again on the next launch ===')
  app = await launch()
  win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(2500)
  check(
    'no scan dialog on second launch',
    await win.locator('text=Add the games on this PC?').first().isVisible(),
    false
  )

  console.log('\n=== but it stays available from Settings, and knows what it already added ===')
  await win.locator('button[aria-label="Settings"]').click()
  await win.waitForTimeout(400)
  await win.locator('button:has-text("Games")').first().click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Scan for installed games")').click()
  await win.waitForTimeout(2500)
  await win.screenshot({ path: path.join(SHOTS, '07-installed-rescan.png') })
  const alreadyLabels = await win.locator('text=already added').count()
  check('the two imported games are marked as already added', alreadyLabels, 2)

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
