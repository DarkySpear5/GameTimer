/*
 * ModifyDialog's "Refresh art" toggle+button (Icon & Background / Appearance
 * tab) was gated on `profile.steamAppId != null` — which hides it for EVERY
 * EA/Epic/GOG/Battle.net-detected game, since none of those launchers expose
 * a Steam appid. refreshArt() itself (profileService.ts) already handles a
 * null appid fine ("Works with or without an appid" — it calls enrichGame()
 * with the profile's exePath too), so this was a pure renderer gating bug.
 * Reported live: an EA-detected "Need for Speed™ Most Wanted" profile (no
 * steamAppId, has exePath) showed only "Change Icon"/"Choose Image" — no way
 * to ever re-fetch. Fixed: gate widened to `steamAppId != null || exePath`,
 * matching the identical condition already used a few lines up for the
 * auto-start-timer section in the same file.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-refresh-art-tmp')
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
  ensureBundlePatched()

  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {
        // No steamAppId, but DOES have exePath — exactly the EA-detected shape.
        'EA Game': game('EA Game', { exePath: 'C:\\Games\\EA\\ea-game.exe' }),
        // Manually added, neither field — Refresh Art must stay hidden here.
        'Manual Game': game('Manual Game')
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
  await win.waitForTimeout(1000)

  console.log('\n=== EA-shaped game (exePath, no steamAppId): Refresh Art must now be visible ===')
  await win.locator('[data-testid="library-item"]:has-text("EA Game")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Modify")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Icon & Background")').click()
  await win.waitForTimeout(300)

  check('Refresh art button is visible', await win.locator('button:has-text("Re-fetch art now")').count() > 0, true)
  check('Auto-fetch art toggle is visible', await win.locator('text=Follow global setting').count() > 0, true)

  await win.locator('.fixed.inset-0.z-50 button[aria-label="Close"]').click()
  await win.waitForTimeout(300)

  console.log('\n=== Manually-added game (neither field): Refresh Art must stay hidden ===')
  await win.locator('button:has-text("Back to Library")').click()
  await win.locator('[data-testid="library-item"]:has-text("Manual Game")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Modify")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Icon & Background")').click()
  await win.waitForTimeout(300)

  check('Refresh art button stays hidden for a purely manual game', await win.locator('button:has-text("Re-fetch art now")').count(), 0)

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
