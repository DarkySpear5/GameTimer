const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')
const DATA = path.join(ROOT, 'game_timer_data.json')
const GAME = 'Session Test Game'

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`
  )
}
const read = () => JSON.parse(fs.readFileSync(DATA, 'utf8')).profiles[GAME]

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'firstrun.json'), '{"legacyImportState":"skipped"}')
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: {
        [GAME]: {
          name: GAME,
          seconds: 0,
          iconFile: null,
          bgColor: null,
          bgImage: null,
          status: 'completed',
          statusAt: '2026-03-15',
          statusSeconds: 3600,
          genres: [],
          lastPlayed: null,
          startedDate: null,
          notes: '',
          rating: 0,
          sessionLog: []
        }
      },
      lastSelected: GAME,
      settings: { trayEnabled: false, checkForUpdates: false, language: 'en' }
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

  console.log('\n=== a short Play/Pause is logged but not counted ===')
  await win.locator('button:has-text("Play")').click()
  await win.waitForTimeout(2500)
  await win.locator('button:has-text("Pause")').click()
  await win.waitForTimeout(900)
  const afterShort = read()
  check('one entry written to the log', afterShort.sessionLog.length, 1)
  // Optional-chained so a missing entry reports as a clean FAIL rather than
  // crashing the run — a suite that dies mid-way is ambiguous about what else
  // would have passed.
  check('flagged short', afterShort.sessionLog[0]?.short, true)

  console.log('\n=== More info opens and reflects the log ===')
  await win.locator(`button:has-text("${GAME}")`).first().click({ button: 'right' })
  await win.waitForTimeout(400)
  await win.locator('text=More info').click()
  await win.waitForTimeout(500)
  const body = await win.locator('.max-w-sm').innerText()
  check('sessions reads 0 (the only session was short)', /Sessions\s+0/.test(body), true)
  check('average shows a dash, not NaN', body.includes('NaN'), false)
  check('completion date is shown', body.includes('2026-03-15'), true)

  console.log('\n=== clearing the record is the only thing that destroys it ===')
  // Electron does not always surface window.confirm through Playwright's
  // dialog event. Stub it in the page instead — deterministic either way.
  await win.evaluate(() => {
    window.confirm = () => true
  })
  await win.locator('button:has-text("Clear completion record")').click()
  await win.waitForTimeout(900)
  const cleared = read()
  check('statusAt cleared', cleared.statusAt, null)
  check('statusSeconds cleared', cleared.statusSeconds, null)
  check('status itself untouched', cleared.status, 'completed')
  check('playtime untouched', typeof cleared.seconds, 'number')

  await app.close()
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error('CRASHED:', e)
  process.exit(1)
})
