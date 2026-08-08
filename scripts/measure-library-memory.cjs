/*
 * Measures what the Library grid actually costs, at a realistic library size.
 *
 * The roadmap's §13 exists because the grid is the first view in this app that
 * puts art for EVERY game on screen at once — the only images whose cost scales
 * with the size of the library. The question it has to answer is not "is the
 * grid fast" but "was capping cover art at 480px necessary, or cargo cult".
 *
 * So it runs twice against identical libraries, changing only the pixel size of
 * the cover files on disk:
 *
 *   480px  — COVER_MAX_DIMENSION, what the app actually stores
 *   2560px — BACKGROUND_MAX_DIMENSION, what the grid would have cost had it
 *            reused bgImage instead of getting its own capped image
 *
 * Reports Electron's own per-process metrics, so the renderer (which holds the
 * decoded bitmaps) is visible separately from main.
 *
 * Usage: node scripts/measure-library-memory.cjs [gameCount]
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')
const { makePng } = require(
  path.join(
    process.env.LOCALAPPDATA || '',
    'Temp/claude/C--Users-ericd-AppData-Local-Programs-GameTimer/41f64db6-c7eb-4a3b-87b6-bebc41f97ed4/scratchpad/makepng.js'
  )
)

const GAMES = Number(process.argv[2] || 40)
const SCRATCH = path.join(__dirname, '..', '.measure-tmp')
const ROOT = path.join(SCRATCH, 'gametimer')

function seed(coverSize) {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(path.join(ROOT, 'covers'), { recursive: true })
  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )

  const profiles = {}
  for (let i = 0; i < GAMES; i++) {
    const name = `Game ${String(i + 1).padStart(2, '0')}`
    const file = `cover${i}.png`
    // Each cover is distinct, so nothing can be deduplicated by the image cache.
    fs.writeFileSync(path.join(ROOT, 'covers', file), makePng(coverSize, coverSize, i))
    profiles[name] = {
      name,
      seconds: (i + 1) * 600,
      status: 'in_progress',
      genres: [],
      rating: 0,
      sessionLog: [],
      coverFile: file
    }
  }

  fs.writeFileSync(
    path.join(ROOT, 'game_timer_data.json'),
    JSON.stringify({
      profiles,
      lastSelected: null,
      settings: {
        trayEnabled: false,
        checkForUpdates: false,
        language: 'en',
        autoFetchArt: false,
        libraryView: 'grid'
      }
    })
  )
}

async function measure(label, coverSize) {
  seed(coverSize)
  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, GAMUT_TEST_APPDATA: SCRATCH }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  // Long enough for every tile to have decoded, and for the grid to settle.
  await win.waitForTimeout(6000)
  await win.mouse.wheel(0, 4000)
  await win.waitForTimeout(2500)

  const metrics = await app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().map((m) => ({ type: m.type, kb: m.memory.workingSetSize }))
  )
  await app.close()

  const byType = {}
  for (const m of metrics) byType[m.type] = (byType[m.type] || 0) + m.kb
  const total = Object.values(byType).reduce((a, b) => a + b, 0)
  const mb = (kb) => `${(kb / 1024).toFixed(0)} MB`

  console.log(`\n${label}  (${GAMES} games, ${coverSize}px covers)`)
  const onDisk = fs
    .readdirSync(path.join(ROOT, 'covers'))
    .reduce((sum, f) => sum + fs.statSync(path.join(ROOT, 'covers', f)).size, 0)
  console.log(`  cover files on disk : ${(onDisk / 1024 / 1024).toFixed(1)} MB`)
  for (const [type, kb] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(20)}: ${mb(kb)}`)
  }
  console.log(`  ${'TOTAL'.padEnd(20)}: ${mb(total)}`)
  return { byType, total }
}

;(async () => {
  const capped = await measure('WITH the 480px cover cap (shipped)', 480)
  const uncapped = await measure('WITHOUT it — 2560px, i.e. reusing bgImage', 2560)

  const rendererOf = (r) => r.byType['Tab'] ?? r.byType['renderer'] ?? 0
  console.log('\n=== difference ===')
  console.log(`  renderer : ${((rendererOf(uncapped) - rendererOf(capped)) / 1024).toFixed(0)} MB more without the cap`)
  console.log(`  total    : ${((uncapped.total - capped.total) / 1024).toFixed(0)} MB more without the cap`)
  fs.rmSync(SCRATCH, { recursive: true, force: true })
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
