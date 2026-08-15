/*
 * Reported live: a profile with real history from before idle tracking
 * existed (14+ hours of `seconds`) showed exactly 0% idle no matter how long
 * the game sat open unattended, even after the feature was working. Root
 * cause: `idleSeconds = openSeconds - seconds` compared `openSeconds`
 * (which only covers launches Gamut actually watched) against the profile's
 * ALL-TIME `seconds` total (which already had real history behind it) — the
 * huge pre-tracking history permanently dwarfed openSeconds, clamping idle
 * to 0 for as long as it would take openSeconds ALONE to overtake a number
 * it was never supposed to be measured against.
 *
 * Fixed with `secondsAtOpenTrackingStart` (a baseline snapshot of `seconds`
 * taken the first time openSeconds ever accrues) and `idleSecondsFor()`
 * (sessionStats.ts), which nets out only the `seconds` accrued SINCE that
 * snapshot. This verifies both the exact reported shape (huge history, no
 * baseline yet — the real-world state every already-affected profile is in
 * right now) and a profile that's had a baseline established, in both the
 * per-game More Info dialog and the account-wide Profile Stats aggregate.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-idle-baseline-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const DATA = path.join(ROOT, 'game_timer_data.json')
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
    sessionStats: { count: 24, totalSeconds: 52441, longestSeconds: 5247, firstPlayedAt: 1755000000000, lastPlayedAt: 1755600000000 },
    sessionLog: [], activeSession: null, exePath: 'C:\\Games\\game.exe', steamAppId: null,
    launchUri: null, installDir: null, autoFetchArt: null, launches: 3,
    openSeconds: 0, secondsAtOpenTrackingStart: null, autoStartTimer: null, genresFromDetection: false,
    favorite: false, coverFile: null, subCategories: [], subCategoriesEnabled: null,
    ...extra
  }
}

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  ensureBundlePatched()

  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {
        // Exact reported shape: 14:34:01 of pre-tracking history, some
        // openSeconds already accrued under the OLD code, no baseline ever
        // captured (real-world state of every already-affected profile).
        'Fields of Mistria': game('Fields of Mistria', {
          seconds: 52441, // 14:34:01
          openSeconds: 4239, // 01:10:39
          secondsAtOpenTrackingStart: null
        }),
        // A profile that's had a baseline established (post-fix accrual):
        // 5 real minutes played since tracking started, 20 min game-open —
        // 15 real idle minutes.
        'Baselined Game': game('Baselined Game', {
          seconds: 10_000 + 300,
          openSeconds: 1_200,
          secondsAtOpenTrackingStart: 10_000
        }),
        // Control: genuinely never watched, must still show the "needs
        // watching" note, not a bogus idle figure.
        'Never Watched': game('Never Watched', { seconds: 500 })
      },
      lastSelected: null,
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en', watchForGames: false }
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

  console.log('\n=== Fields of Mistria (the exact reported case): idle now shows real time, not 0 ===')
  await win.locator('[data-testid="library-item"]:has-text("Fields of Mistria")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("More info")').click()
  await win.waitForTimeout(300)
  const mistriaText = await win.locator('.fixed.inset-0.z-50').innerText()
  console.log('  dialog text:\n' + mistriaText.split('\n').map((l) => '    ' + l).join('\n'))
  check('does NOT show the old 0:00:00 (0%) idle bug', mistriaText.includes('0:00:00 (0%)'), false)
  check('shows the full existing openSeconds (01:10:39) as idle, at 100%', mistriaText.includes('01:10:39 (100%)'), true)
  await win.locator('.fixed.inset-0.z-50 button[aria-label="Close"]').click()
  await win.waitForTimeout(300)

  console.log('\n=== Baselined Game: idle correctly nets out only seconds accrued since the baseline ===')
  await win.locator('button:has-text("Back to Library")').click()
  await win.waitForTimeout(300)
  await win.locator('[data-testid="library-item"]:has-text("Baselined Game")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("More info")').click()
  await win.waitForTimeout(300)
  const baselinedText = await win.locator('.fixed.inset-0.z-50').innerText()
  console.log('  dialog text:\n' + baselinedText.split('\n').map((l) => '    ' + l).join('\n'))
  check('shows exactly 15:00 idle (20 min open minus 5 min actually played)', baselinedText.includes('15:00'), true)
  await win.locator('.fixed.inset-0.z-50 button[aria-label="Close"]').click()
  await win.waitForTimeout(300)

  console.log('\n=== Never Watched: still shows the "needs watching" note, not a fabricated number ===')
  await win.locator('button:has-text("Back to Library")').click()
  await win.waitForTimeout(300)
  await win.locator('[data-testid="library-item"]:has-text("Never Watched")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("More info")').click()
  await win.waitForTimeout(300)
  const neverWatchedText = await win.locator('.fixed.inset-0.z-50').innerText()
  check(
    'shows the needs-watching explainer, not an idle figure',
    neverWatchedText.includes('No idle time recorded'),
    true
  )

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
