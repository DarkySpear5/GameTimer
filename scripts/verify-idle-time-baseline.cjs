/*
 * TWO real bugs, found live in sequence on the SAME feature.
 *
 * Bug #1 (first fix): a profile with real history from before idle tracking
 * existed (14+ hours of `seconds`) showed exactly 0% idle no matter how long
 * the game sat open unattended. `openSeconds - seconds` compared openSeconds
 * against the profile's ENTIRE all-time seconds total, which permanently
 * dwarfed it.
 *
 * Bug #2 (this fix — found only after #1 shipped and got tested live): the
 * first fix added ONE baseline, on the `seconds` side only. That broke a
 * DIFFERENT way: a profile with real openSeconds already sitting on it from
 * before that baseline existed had nothing to net THAT side against, so ALL
 * of it read as idle — even next to real hours of active play. Reported
 * live: 9:25:18 played, 13:44:10 open, shown as 13:44:10 (100%) idle.
 * Flatly false, and provably so to the one person who knew how much of that
 * time he was actually playing.
 *
 * The real fix needs a baseline on BOTH sides, captured together
 * (secondsAtOpenTrackingStart / openSecondsAtOpenTrackingStart) — old,
 * un-split history is excluded entirely rather than assumed to belong to
 * either side. Verifies: the exact bug #2 shape (real seconds AND real
 * openSeconds, no baseline pair yet — shows "not tracked yet", not a wrong
 * number), a profile with a real baseline pair (proves the actual delta
 * math), and a genuinely-never-watched control.
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
    sessionStats: { count: 12, totalSeconds: 33918, longestSeconds: 5934, firstPlayedAt: 1754697600000, lastPlayedAt: 1755302400000 },
    sessionLog: [], activeSession: null, exePath: 'C:\\Games\\game.exe', steamAppId: null,
    launchUri: null, installDir: null, autoFetchArt: null, launches: 10,
    openSeconds: 0, secondsAtOpenTrackingStart: null, openSecondsAtOpenTrackingStart: null,
    autoStartTimer: null, genresFromDetection: false,
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
        // The exact reported bug #2 shape: real seconds (9:25:18) AND real
        // openSeconds (13:44:10), neither baseline ever captured. Must show
        // "not tracked yet", not a fabricated 0% or 100%.
        'Fields of Mistria': game('Fields of Mistria', {
          seconds: 33918, // 9:25:18
          openSeconds: 49450, // 13:44:10
          secondsAtOpenTrackingStart: null,
          openSecondsAtOpenTrackingStart: null
        }),
        // A profile with a REAL baseline pair established (post-fix
        // accrual): 5 min played and 20 min open SINCE the baseline, on top
        // of old history both baselines correctly exclude.
        'Baselined Game': game('Baselined Game', {
          seconds: 10_000 + 300,
          openSeconds: 8_000 + 1_200,
          secondsAtOpenTrackingStart: 10_000,
          openSecondsAtOpenTrackingStart: 8_000
        }),
        // Control: genuinely never watched, must still show the "needs
        // watching" note, not a bogus idle figure.
        'Never Watched': game('Never Watched', { seconds: 500, openSeconds: 0 })
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

  console.log('\n=== Fields of Mistria (exact bug #2 shape): no baseline yet -> "not tracked", NOT a wrong number ===')
  await win.locator('[data-testid="library-item"]:has-text("Fields of Mistria")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("More info")').click()
  await win.waitForTimeout(300)
  const mistriaText = await win.locator('.fixed.inset-0.z-50').innerText()
  console.log('  dialog text:\n' + mistriaText.split('\n').map((l) => '    ' + l).join('\n'))
  check('does NOT claim 100% idle (the actual reported bug)', mistriaText.includes('(100%)'), false)
  check('does NOT claim 0% idle either (the FIRST bug, must stay fixed)', mistriaText.includes('(0%)'), false)
  check('shows the "not tracked yet" explainer instead of any number', mistriaText.includes('No idle time recorded'), true)
  await win.locator('.fixed.inset-0.z-50 button[aria-label="Close"]').click()
  await win.waitForTimeout(300)

  console.log('\n=== Baselined Game: idle correctly nets out only the window SINCE the baseline, on both sides ===')
  await win.locator('button:has-text("Back to Library")').click()
  await win.waitForTimeout(300)
  await win.locator('[data-testid="library-item"]:has-text("Baselined Game")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("More info")').click()
  await win.waitForTimeout(300)
  const baselinedText = await win.locator('.fixed.inset-0.z-50').innerText()
  console.log('  dialog text:\n' + baselinedText.split('\n').map((l) => '    ' + l).join('\n'))
  check('"Game was open" shows only the since-baseline 20:00, not the raw 2:33:20 total', baselinedText.includes('00:20:00'), true)
  check('shows exactly 15:00 idle (20 min open minus 5 min actually played, both since baseline)', baselinedText.includes('00:15:00'), true)
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
