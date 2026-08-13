/*
 * Regression coverage for two real bugs found by hand after the first pass:
 *   1. The main window's own canvas going stale after the pop-out closes
 *      (data on disk was correct, the main window's rendered view wasn't).
 *   2. The literal drag-to-reattach the punch list asked for, which the
 *      first pass scoped out as unverifiable — now built, so now verified.
 * Also covers the fullscreen lockout the user hit (no title bar, no
 * taskbar, no way back) and its fix (fullscreenable: false).
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-notes-drag-tmp')
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

function game(name, extra = {}) {
  return {
    name, seconds: 100, iconFile: null, bgColor: null, bgImage: null,
    status: 'in_progress', statusAt: null, statusSeconds: null, genres: [],
    lastPlayed: null, startedDate: null, notes: '', noteList: [], rating: 0,
    sessionStats: { count: 0, totalSeconds: 0, longestSeconds: 0, firstPlayedAt: null, lastPlayedAt: null },
    sessionLog: [], activeSession: null, exePath: null, steamAppId: null,
    launchUri: null, installDir: null, autoFetchArt: null, launches: 0,
    openSeconds: 0, autoStartTimer: null, genresFromDetection: false,
    favorite: false, coverFile: null, ...extra
  }
}

const readProfiles = () => JSON.parse(fs.readFileSync(DATA, 'utf8')).profiles

function drawStroke(page, box) {
  return async () => {
    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + 50, box.y + 50, { steps: 4 })
    await page.mouse.up()
  }
}

/** Simulates a native drag: repeated bounds changes (same WM_WINDOWPOSCHANGED path Windows uses for a real drag), landing on `end`. Pass a mid-drag callback to assert hover state before release. */
async function simulateDragTo(app, end, onMidDrag) {
  const steps = 6
  const start = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('drawing-popout'))
    return w.getBounds()
  })
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(start.x + ((end.x - start.x) * i) / steps)
    const y = Math.round(start.y + ((end.y - start.y) * i) / steps)
    await app.evaluate(
      ({ BrowserWindow }, pos) => {
        const w = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('drawing-popout'))
        if (w && !w.isDestroyed()) w.setBounds({ ...w.getBounds(), x: pos.x, y: pos.y })
      },
      { x, y }
    )
    if (i === steps && onMidDrag) await onMidDrag()
    await new Promise((r) => setTimeout(r, 60))
  }
}

/**
 * Screen-space center of the main window's drop-zone element RIGHT NOW —
 * Playwright's boundingBox() is viewport-relative, so it's added to the main
 * window's own current on-screen content position (same conversion
 * drawingPopout.ts itself does) to get a real drag target.
 */
async function dropZoneCenter(app, mainPage) {
  const box = await mainPage.locator('[data-testid="note-drop-zone"]').boundingBox()
  const content = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes('drawing-popout'))
    return w.getContentBounds()
  })
  return { x: content.x + box.x + box.width / 2, y: content.y + box.y + box.height / 2 }
}

;(async () => {
  fs.rmSync(SCRATCH, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  fs.mkdirSync(SHOTS, { recursive: true })
  fs.writeFileSync(
    path.join(ROOT, 'firstrun.json'),
    JSON.stringify({ legacyImportState: 'skipped', installedScanState: 'skipped' })
  )
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      profiles: { 'Drag Game': game('Drag Game') },
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
  await win.waitForTimeout(1200)

  await win.locator('[data-testid="library-item"]:has-text("Drag Game")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Notes")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("New note")').click()
  await win.waitForTimeout(400)

  console.log('\n=== bug #1 repro: draw before popout, draw in popout, draw again in main after close ===')
  const mainCanvas = win.locator('canvas')
  await drawStroke(win, await mainCanvas.boundingBox())()
  await win.waitForTimeout(400)

  const [popout] = await Promise.all([
    app.waitForEvent('window'),
    win.locator('button:has-text("Pop out")').click()
  ])
  await popout.waitForLoadState('domcontentloaded')
  await popout.waitForTimeout(500)

  check(
    'fullscreenable is off on the pop-out (the reported fullscreen lockout)',
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('drawing-popout'))
      return w.isFullScreenable()
    }),
    false
  )

  await drawStroke(popout, await popout.locator('canvas').boundingBox())()
  await win.waitForTimeout(400)

  // Move it fully off both windows first so the reattach logic definitely
  // isn't accidentally overlapping anything before this test wants it to.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('drawing-popout'))
    w.setPosition(2000, 2000)
  })
  await win.waitForTimeout(300)

  await popout.close()
  await win.waitForTimeout(500)

  await drawStroke(win, await win.locator('canvas').boundingBox())()
  await win.waitForTimeout(400)

  const strokesAfterCloseFlow = readProfiles()['Drag Game'].noteList[0].drawing
  check(
    'all 3 strokes present (main-before, popout, main-after) — none silently overwritten by a stale view',
    strokesAfterCloseFlow.length,
    3
  )

  console.log('\n=== drag-to-reattach: dragging the pop-out onto the main window closes it and keeps the drawing ===')
  const [popout2] = await Promise.all([
    app.waitForEvent('window'),
    win.locator('button:has-text("Pop out")').click()
  ])
  await popout2.waitForLoadState('domcontentloaded')
  await popout2.waitForTimeout(500)
  await drawStroke(popout2, await popout2.locator('canvas').boundingBox())()
  await win.waitForTimeout(300)

  console.log('  maximizing the pop-out must NOT merge it — it covers the drop zone but the user just wants room to draw')
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('drawing-popout'))
    w.maximize()
  })
  await win.waitForTimeout(500)
  check(
    'pop-out is still open after maximizing, despite now covering the drop zone',
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    2
  )
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('drawing-popout'))
    w.unmaximize()
    w.setBounds({ x: 2000, y: 2000, width: 420, height: 480 })
  })
  await win.waitForTimeout(500)

  console.log('  landing elsewhere on the app (title bar area) should do nothing — proves this is a specific zone now')
  const mainBounds = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes('drawing-popout'))
    return w.getBounds()
  })
  await simulateDragTo(app, { x: mainBounds.x + 40, y: mainBounds.y + 15 })
  await win.waitForTimeout(500)
  check(
    'pop-out is still open — the title bar is well inside the app window but outside the drop zone',
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    2
  )

  let hoveredMidDrag = false
  const zoneTarget = await dropZoneCenter(app, win)
  await simulateDragTo(app, zoneTarget, async () => {
    await win.waitForTimeout(150) // let the (undebounced) hover check catch up to this step
    hoveredMidDrag = await win.locator('[data-testid="note-drop-zone"]').evaluate((el) => {
      const shadow = getComputedStyle(el).boxShadow
      return shadow !== 'none' && shadow !== ''
    })
  })
  await win.waitForTimeout(500)

  check('the drop zone highlighted while the pop-out was hovering over it, before release', hoveredMidDrag, true)
  check(
    'pop-out window closed itself after landing on the specific drop zone (not just anywhere on the app)',
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    1
  )
  const strokesAfterDrag = readProfiles()['Drag Game'].noteList[0].drawing
  check('the stroke drawn just before the drag was kept (4 total now)', strokesAfterDrag.length, 4)

  console.log('\n=== drag onto a DIFFERENT note in view -> overwrite confirm ===')
  // We're still on the original note's editor (it has 4 strokes from the
  // sections above) — rename it while it's open, THEN back out. A second
  // note gets a stroke of its own too — both named distinctly so the rest of
  // this section can target each by name instead of guessing list positions.
  await win.locator('button[title="Click to rename"]').click()
  await win.locator('input[placeholder="Untitled note"]').fill('Source Note')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(300)
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(300)

  await win.locator('button:has-text("New note")').click()
  await win.waitForTimeout(300)
  await win.locator('button[title="Click to rename"]').click()
  await win.locator('input[placeholder="Untitled note"]').fill('Target Note')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(300)
  await drawStroke(win, await win.locator('canvas').boundingBox())()
  await win.waitForTimeout(400)
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(300)

  // Pop out Source Note...
  await win.locator('text=Source Note').click()
  await win.waitForTimeout(300)
  const [popout3] = await Promise.all([
    app.waitForEvent('window'),
    win.locator('button:has-text("Pop out")').click()
  ])
  await popout3.waitForLoadState('domcontentloaded')
  await popout3.waitForTimeout(500)

  // ...then switch the MAIN window to Target Note while the pop-out (still tracking Source Note) is out.
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(300)
  await win.locator('text=Target Note').click()
  await win.waitForTimeout(300)

  let confirmMessage = null
  popout3.once('dialog', (d) => {
    confirmMessage = d.message()
    void d.accept()
  })
  const zoneTarget2 = await dropZoneCenter(app, win)
  await simulateDragTo(app, zoneTarget2)
  await win.waitForTimeout(500)

  check('drag onto a different note triggered a confirm', typeof confirmMessage, 'string')
  check('the confirm names the target note', confirmMessage?.includes('Target Note'), true)
  const notesAfterMerge = readProfiles()['Drag Game'].noteList
  const sourceAfter = notesAfterMerge.find((n) => n.title === 'Source Note')
  const targetAfter = notesAfterMerge.find((n) => n.title === 'Target Note')
  check('the drag source note is now empty (its drawing moved out)', sourceAfter.drawing.length, 0)
  check('the drag target note has the merged-in (overwritten) drawing', targetAfter.drawing.length, 4)

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
