/*
 * Two more real gaps the user found by hand:
 *   1. Dragging a pop-out onto a DIFFERENT GAME's note editor silently did
 *      nothing — moveDrawing only ever supported one profile, so the target
 *      note lookup failed closed instead of merging or asking to overwrite.
 *   2. No eraser — a drawing could only ever be cleared entirely.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-notes-cg-tmp')
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

function note(id, title, drawing) {
  return { id, title, body: '', drawing, createdAt: 1, updatedAt: 1 }
}

function game(name, noteList) {
  return {
    name, seconds: 100, iconFile: null, bgColor: null, bgImage: null,
    status: 'in_progress', statusAt: null, statusSeconds: null, genres: [],
    lastPlayed: null, startedDate: null, notes: '', noteList, rating: 0,
    sessionStats: { count: 0, totalSeconds: 0, longestSeconds: 0, firstPlayedAt: null, lastPlayedAt: null },
    sessionLog: [], activeSession: null, exePath: null, steamAppId: null,
    launchUri: null, installDir: null, autoFetchArt: null, launches: 0,
    openSeconds: 0, autoStartTimer: null, genresFromDetection: false,
    favorite: false, coverFile: null
  }
}

const existingDrawing = [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], color: '#ffffff', width: 2.5 }]
const readProfiles = () => JSON.parse(fs.readFileSync(DATA, 'utf8')).profiles

async function simulateDragTo(app, end) {
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
    await new Promise((r) => setTimeout(r, 60))
  }
}

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
      profiles: {
        'Game Alpha': game('Game Alpha', [note('alpha-note', 'Alpha Note', [])]),
        'Game Beta': game('Game Beta', [note('beta-note', 'Beta Note', existingDrawing)])
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
  await win.waitForTimeout(1200)

  console.log('\n=== cross-game drag merge, with the overwrite confirm ===')
  await win.locator('[data-testid="library-item"]:has-text("Game Alpha")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Notes")').click()
  await win.waitForTimeout(300)
  await win.locator('text=Alpha Note').click()
  await win.waitForTimeout(300)

  // Draw into Alpha's note so there's something to move.
  const canvas1 = win.locator('canvas')
  const box1 = await canvas1.boundingBox()
  await win.mouse.move(box1.x + 10, box1.y + 10)
  await win.mouse.down()
  await win.mouse.move(box1.x + 60, box1.y + 60, { steps: 4 })
  await win.mouse.up()
  await win.waitForTimeout(300)

  const [popout] = await Promise.all([
    app.waitForEvent('window'),
    win.locator('button:has-text("Pop out")').click()
  ])
  await popout.waitForLoadState('domcontentloaded')
  await popout.waitForTimeout(500)

  // Switch the MAIN window to a DIFFERENT GAME's note while Alpha's is popped out.
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(300)
  await win.keyboard.press('Escape') // close the Notes modal before navigating the Library behind it
  await win.waitForTimeout(200)
  await win.locator('button:has-text("Back to Library")').click()
  await win.waitForTimeout(300)
  await win.locator('[data-testid="library-item"]:has-text("Game Beta")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Notes")').click()
  await win.waitForTimeout(300)
  await win.locator('text=Beta Note').click()
  await win.waitForTimeout(300)

  let confirmMessage = null
  popout.once('dialog', (d) => {
    confirmMessage = d.message()
    void d.accept()
  })
  const target = await dropZoneCenter(app, win)
  await simulateDragTo(app, target)
  await win.waitForTimeout(600)

  check('a confirm was shown for the cross-game overwrite', typeof confirmMessage, 'string')
  check('the confirm names the target note', confirmMessage?.includes('Beta Note'), true)
  check('the confirm names the target GAME', confirmMessage?.includes('Game Beta'), true)

  const profiles = readProfiles()
  check('Alpha Note is now empty (its drawing moved out)', profiles['Game Alpha'].noteList[0].drawing.length, 0)
  check('Beta Note now has the moved-in drawing', profiles['Game Beta'].noteList[0].drawing.length, 1)
  check(
    'pop-out closed itself after the cross-game merge',
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    1
  )

  console.log('\n=== eraser: removes only the stroke it touches ===')
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("New note")').click()
  await win.waitForTimeout(400)

  const canvas2 = win.locator('canvas')
  const box2 = await canvas2.boundingBox()
  // Stroke A, top-left corner.
  await win.mouse.move(box2.x + 10, box2.y + 10)
  await win.mouse.down()
  await win.mouse.move(box2.x + 30, box2.y + 10, { steps: 3 })
  await win.mouse.up()
  await win.waitForTimeout(200)
  // Stroke B, bottom-right corner — far enough away not to be caught by the same erase pass.
  await win.mouse.move(box2.x + box2.width - 30, box2.y + box2.height - 10)
  await win.mouse.down()
  await win.mouse.move(box2.x + box2.width - 10, box2.y + box2.height - 10, { steps: 3 })
  await win.mouse.up()
  await win.waitForTimeout(300)

  let notesNow = readProfiles()['Game Beta'].noteList
  check('two strokes drawn', notesNow[0].drawing.length, 2)

  await win.locator('button[title*="Eraser"]').click()
  await win.waitForTimeout(200)
  // Erase over stroke A only (top-left).
  await win.mouse.move(box2.x + 20, box2.y + 10)
  await win.mouse.down()
  await win.mouse.move(box2.x + 25, box2.y + 10, { steps: 2 })
  await win.mouse.up()
  await win.waitForTimeout(400)

  notesNow = readProfiles()['Game Beta'].noteList
  check('exactly one stroke removed by the eraser', notesNow[0].drawing.length, 1)
  const remaining = notesNow[0].drawing[0].points[0]
  check('the SURVIVING stroke is B (bottom-right), not A', remaining.x > 0.5 && remaining.y > 0.5, true)

  console.log('  switching back to pen still draws normally')
  await win.locator('button[title*="Eraser"]').click()
  await win.waitForTimeout(200)
  await win.mouse.move(box2.x + 50, box2.y + 50)
  await win.mouse.down()
  await win.mouse.move(box2.x + 70, box2.y + 50, { steps: 3 })
  await win.mouse.up()
  await win.waitForTimeout(300)
  notesNow = readProfiles()['Game Beta'].noteList
  check('pen works again after toggling off the eraser', notesNow[0].drawing.length, 2)

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
