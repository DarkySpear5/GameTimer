/*
 * What every launcher scanner actually finds on THIS machine.
 *
 * Reports rather than asserts, because the answer depends on what is installed
 * — it is the measurement tool the roadmap's "do not write a parser for a
 * format you have not opened" rule depends on. Run it after installing a game
 * through a new launcher to confirm that launcher is read correctly.
 *
 * Reads only. Never touches save data.
 */
const path = require('path')
const { _electron: electron } = require('playwright-core')

;(async () => {
  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: path.join(__dirname, '..'),
    // Isolated so the scan reads the real machine but sees an empty library,
    // which means nothing comes back flagged as already-added.
    env: { ...process.env, GAMUT_TEST_APPDATA: path.join(__dirname, '..', '.verify-sources-tmp') }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(2000)

  const t0 = Date.now()
  const found = await win.evaluate(() => window.api.detect.listInstalled())
  const elapsed = Date.now() - t0

  const bySource = {}
  for (const g of found) (bySource[g.source] ??= []).push(g)

  console.log(
    `\n${found.length} games found across ${Object.keys(bySource).length} source(s) in ${(elapsed / 1000).toFixed(1)}s\n`
  )
  for (const [source, games] of Object.entries(bySource)) {
    console.log(`  ${source.toUpperCase()}  (${games.length})`)
    for (const g of games) {
      const how = g.launchUri ? g.launchUri : g.steamAppId ? `steam://rungameid/${g.steamAppId}` : g.exePath ? path.basename(g.exePath) : '—'
      console.log(`     ${g.confident ? ' ' : '?'} ${g.name.padEnd(30)} ${how}`)
    }
    console.log()
  }
  console.log('  (a leading ? means name-only evidence: no install path, not pre-ticked)')

  await app.close()
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
