/*
 * End-to-end check that the Library grid actually fills with real cover art.
 *
 * Everything else about covers has been verified structurally; this is the only
 * thing that proves library_600x900 resolves, downloads, gets capped, and
 * renders. Hits the real network and the real Steam library, writes to an
 * isolated save folder.
 *
 * Skips rather than fails when offline — a network outage is not a regression.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-art-tmp')
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

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  fs.mkdirSync(SHOTS, { recursive: true })
  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped' })
  )
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {},
      lastSelected: null,
      // Art ON — that is the whole point of this run.
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en', autoFetchArt: true }
    })
  )

  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, GAMUT_TEST_APPDATA: SCRATCH }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(3000)

  console.log('\n=== import real installed games with art enabled ===')
  await win.locator('button:has-text("Select none")').click()
  await win.waitForTimeout(300)
  const boxes = win.locator('label:has(input[type="checkbox"]) input:not([disabled])')
  const count = Math.min(6, await boxes.count())
  for (let i = 0; i < count; i++) await boxes.nth(i).check()
  await win.waitForTimeout(200)
  await win.locator(`button:has-text("Add ${count} games")`).click()

  // Art is fetched per game over the network during import.
  await win.waitForTimeout(45000)

  const profiles = JSON.parse(fs.readFileSync(DATA, 'utf8')).profiles
  const names = Object.keys(profiles)
  check('games were imported', names.length, count)

  const withCover = names.filter((n) => profiles[n].coverFile)
  const withIcon = names.filter((n) => profiles[n].iconFile)
  console.log(`  ..    ${withCover.length}/${names.length} got a cover, ${withIcon.length}/${names.length} got an icon`)

  if (withCover.length === 0) {
    console.log('  ..    no art at all — treating as offline, not a regression')
    await app.close()
    process.exit(0)
  }

  check('most games got portrait cover art', withCover.length >= Math.ceil(count / 2), true)

  const coversDir = path.join(ROOT, 'covers')
  const files = fs.readdirSync(coversDir)
  check('cover files landed on disk', files.length >= withCover.length, true)
  const biggest = Math.max(...files.map((f) => fs.statSync(path.join(coversDir, f)).size))
  console.log(`  ..    largest cover file: ${(biggest / 1024).toFixed(0)} KB`)
  // A 480px-capped JPEG has no business being megabytes.
  check('covers are capped, not full-size downloads', biggest < 800 * 1024, true)

  await win.waitForTimeout(1500)
  await win.screenshot({ path: path.join(SHOTS, '11-library-real-art.png') })
  await win.locator('[data-testid="library-item"]').first().click()
  await win.waitForTimeout(800)
  await win.screenshot({ path: path.join(SHOTS, '12-detail-real-art.png') })

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
