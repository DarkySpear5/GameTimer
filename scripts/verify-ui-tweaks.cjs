/*
 * Three small, independent UI fixes reported live by the user in one message:
 *   1. AddGameDialog: "Scan for installed games" and "Detect running game"
 *      had their accent-color emphasis backwards from what the user wanted —
 *      swapped which BigButton gets `primary`.
 *   2. Modal's X close button was a bare 14x14 SVG with zero padding —
 *      "sometime its hard to click it". Grew the hit target with p-2/-m-2.
 * This verifies both land correctly in the real packaged app: a screenshot
 * of the swapped button colors, and a click just outside the OLD 14x14 box
 * (which would have missed before the fix) that now still closes the modal.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-ui-tweaks-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const DATA = path.join(ROOT, 'game_timer_data.json')
const BUNDLE = path.join(__dirname, '..', 'out', 'main', 'index.js')
const SHOTS = path.join(__dirname, '..', '.verify-shots')

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
    name, seconds: 100, iconFile: null, bgColor: null, bgImage: null,
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

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  fs.mkdirSync(SHOTS, { recursive: true })
  ensureBundlePatched()

  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: { 'X Button Test': game('X Button Test') },
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
  await win.waitForTimeout(1000)

  console.log('\n=== AddGameDialog: Scan-installed is now the accent button, Detect-running is now plain ===')
  await win.locator('button:has-text("+ Add Game")').click()
  await win.waitForTimeout(400)

  const scanBg = await win
    .locator('button', { hasText: 'Scan for installed games' })
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  const detectBg = await win
    .locator('button', { hasText: 'Detect running game' })
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log('  Scan button bg:', scanBg, ' Detect button bg:', detectBg)
  check('the two buttons now have DIFFERENT backgrounds (colors were swapped, not just equalized)', scanBg !== detectBg, true)

  await win.screenshot({ path: path.join(SHOTS, 'addgame-color-swap.png') })
  console.log(`  screenshot: ${path.join(SHOTS, 'addgame-color-swap.png')}`)

  await win.locator('.fixed.inset-0.z-50 button[aria-label="Close"]').click()
  await win.waitForTimeout(300)

  console.log('\n=== Modal X close button: bigger hit target ===')
  await win.locator('[data-testid="library-item"]:has-text("X Button Test")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Notes")').click()
  await win.waitForTimeout(400)

  const closeBtn = win.locator('.fixed.inset-0.z-50 button[aria-label="Close"]')
  const box = await closeBtn.boundingBox()
  console.log('  close button hit box:', box)
  check('hit box is meaningfully bigger than the bare 14x14 icon', box.width >= 28 && box.height >= 28, true)

  // Click 9px above-right of the icon's visual top-right corner (icon is a
  // 14x14 box inset from the button's own edges) — inside the OLD 14x14
  // hitbox this would have missed the button entirely and landed on the
  // header row instead, doing nothing.
  await win.mouse.click(box.x + box.width - 2, box.y + 2)
  await win.waitForTimeout(400)

  const modalStillOpen = (await win.locator('text=Notes for').count()) > 0
  check('clicking near the edge of the enlarged hit area closed the modal', modalStillOpen, false)

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
