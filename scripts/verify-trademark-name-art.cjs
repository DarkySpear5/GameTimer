/*
 * Root-cause fix: `reg.exe`'s piped stdout undergoes Windows' lossy
 * "best-fit" Unicode-to-codepage downconversion before Gamut ever reads it —
 * a real ™ (U+2122) in a registry DisplayName came back as a plain "T".
 * Reproduced live with a throwaway HKCU test value: `reg.exe query` printed
 * "Need for SpeedT Most Wanted" for a value literally set to
 * "Need for Speed™ Most Wanted". Since EA's own uninstall entries carry a
 * real ™ in almost every title, this silently corrupted EVERY EA-detected
 * game's name — which then broke exact-title Steam/Epic/GOG art matching
 * entirely (a corrupted "...SpeedT..." matches nothing in any catalogue),
 * cascading into the "why is it just a placeholder letter" symptom reported
 * live. Fixed in registry.ts by forcing [Console]::OutputEncoding to UTF-8
 * before any PowerShell output — verified against real registry data
 * separately (regTree/regValues/regSubkeys all now round-trip a real ™
 * correctly, see this fix's commit for details).
 *
 * This script verifies the DOWNSTREAM half end to end: given a profile with
 * the CORRECTLY-preserved name (what registry.ts now actually produces),
 * does the full enrichGame() pipeline resolve real Steam art for it? Can't
 * easily test the registry-scan step itself here without an admin-elevated
 * write to the real system-wide HKLM Uninstall hive, which is too invasive
 * for an E2E script — that half was already verified directly against real
 * registry data during development.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-trademark-tmp')
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
    sessionStats: { count: 0, totalSeconds: 0, longestSeconds: 0, firstPlayedAt: null, lastPlayedAt: null },
    sessionLog: [], activeSession: null, exePath: null, steamAppId: null,
    launchUri: null, installDir: null, autoFetchArt: null, launches: 0,
    openSeconds: 0, autoStartTimer: null, genresFromDetection: false,
    favorite: false, coverFile: null, subCategories: [], subCategoriesEnabled: null,
    ...extra
  }
}

const readProfiles = () => JSON.parse(fs.readFileSync(DATA, 'utf8')).profiles

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  ensureBundlePatched()

  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  const REAL_NAME = 'Need for Speed\u2122 Most Wanted' // the exact real Steam listing title
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {
        [REAL_NAME]: game(REAL_NAME, { exePath: 'C:\\Games\\EA\\nfsmw.exe' })
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
  app.process().stdout.on('data', (d) => process.stdout.write(`[main] ${d}`))
  app.process().stderr.on('data', (d) => process.stderr.write(`[main] ${d}`))
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1000)

  console.log(`\n=== a correctly-™-named EA game can now Refresh Art and get a real Steam cover ===`)
  await win.locator(`[data-testid="library-item"]:has-text("Need for Speed")`).click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Modify")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Icon & Background")').click()
  await win.waitForTimeout(300)
  check('Refresh art button is visible (exePath-based gate)', await win.locator('button:has-text("Re-fetch art now")').count() > 0, true)

  await win.locator('button:has-text("Re-fetch art now")').click()
  await win.waitForTimeout(6000) // real network fetch against Steam

  const profile = readProfiles()[REAL_NAME]
  console.log('  resulting coverFile:', profile.coverFile, ' iconFile:', profile.iconFile)
  check('a real coverFile was fetched (Steam exact-title match succeeded)', profile.coverFile != null, true)

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
