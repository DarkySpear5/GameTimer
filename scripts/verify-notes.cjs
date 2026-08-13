/*
 * L1/L2: multi-note list + a drawing canvas per note, driven through the real
 * UI against the actual packaged app.
 */
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright-core')

const SCRATCH = path.join(__dirname, '..', '.verify-notes-tmp')
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
        'Puzzle Game': game('Puzzle Game'),
        // Legacy single-note text, no noteList yet — the migration must fold
        // it in at load, and this is what proves it happened for real.
        'Legacy Notes Game': game('Legacy Notes Game', { notes: 'old style note text', noteList: [] }),
        'Popout Game': game('Popout Game')
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
  await win.waitForTimeout(1500)

  console.log('\n=== migration folded the legacy note in at load ===')
  const migrated = readProfiles()['Legacy Notes Game'].noteList
  check('one note created from legacy text', migrated.length, 1)
  check('body carries the old text', migrated[0]?.body, 'old style note text')

  console.log('\n=== L1: empty list, + New note, rename, back, reopen ===')
  await win.locator('[data-testid="library-item"]:has-text("Puzzle Game")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Notes")').click()
  await win.waitForTimeout(400)
  await win.screenshot({ path: path.join(SHOTS, 'notes-01-empty-list.png') })
  check('empty state shown', await win.locator('text=No notes yet').isVisible(), true)

  await win.locator('button:has-text("New note")').click()
  await win.waitForTimeout(400)
  check('editor opened for the new note', await win.locator('text=Untitled note').first().isVisible(), true)

  // Rename in place.
  await win.locator('button[title="Click to rename"]').click()
  await win.locator('input[placeholder="Untitled note"]').fill('Boss strategy')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(400)

  // Type body text — must survive navigating away before the debounce fires.
  await win.locator('textarea').fill('stand on the left platform')
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(500)
  await win.screenshot({ path: path.join(SHOTS, 'notes-02-list-with-one.png') })
  check('renamed note appears in the list', await win.locator('text=Boss strategy').isVisible(), true)

  let onDisk = readProfiles()['Puzzle Game'].noteList
  check('exactly one note on disk', onDisk.length, 1)
  check('title persisted', onDisk[0].title, 'Boss strategy')
  check('body persisted despite navigating away immediately (debounce flush)', onDisk[0].body, 'stand on the left platform')

  console.log('\n=== L2: drawing a stroke on the canvas persists ===')
  await win.locator('text=Boss strategy').click()
  await win.waitForTimeout(400)
  const canvas = win.locator('canvas')
  const box = await canvas.boundingBox()
  await win.mouse.move(box.x + 10, box.y + 10)
  await win.mouse.down()
  await win.mouse.move(box.x + 60, box.y + 60, { steps: 5 })
  await win.mouse.move(box.x + 100, box.y + 20, { steps: 5 })
  await win.mouse.up()
  await win.waitForTimeout(400)
  await win.screenshot({ path: path.join(SHOTS, 'notes-03-drawing.png') })

  onDisk = readProfiles()['Puzzle Game'].noteList
  check('one stroke saved', onDisk[0].drawing.length, 1)
  check('stroke has multiple points', onDisk[0].drawing[0].points.length > 1, true)

  console.log('\n=== a second note keeps the first untouched (per-note storage) ===')
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("New note")').click()
  await win.waitForTimeout(400)
  await win.locator('textarea').fill('second note body')
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(500)

  onDisk = readProfiles()['Puzzle Game'].noteList
  check('two notes now', onDisk.length, 2)
  check('first note (newest-first order) is the untitled second one', onDisk[0].body, 'second note body')
  check('the drawn note is still second, and keeps its stroke', onDisk[1].drawing.length, 1)

  console.log('\n=== delete removes just that one note ===')
  await win.locator('text=Boss strategy').click()
  await win.waitForTimeout(400)
  win.once('dialog', (d) => d.accept())
  // Two "Delete" buttons on screen — Library's own action bar behind the
  // modal, and the note editor's. The note editor's is the last in DOM order.
  await win.locator('button:has-text("Delete")').last().click()
  await win.waitForTimeout(400)
  onDisk = readProfiles()['Puzzle Game'].noteList
  check('one note left after delete', onDisk.length, 1)
  check('the surviving note is the untitled one', onDisk[0].body, 'second note body')

  console.log('\n=== L3: pop out, draw, close -> auto-reattaches ===')
  // A separate, untouched game — keeps this section independent of state
  // left behind by the sections above. The Notes modal from the previous
  // section is still open over the Library detail page, so close it first.
  await win.keyboard.press('Escape')
  await win.waitForTimeout(200)
  await win.locator('button:has-text("Back to Library")').click()
  await win.waitForTimeout(200)
  await win.locator('[data-testid="library-item"]:has-text("Popout Game")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("Notes")').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("New note")').click()
  await win.waitForTimeout(400)

  const [popoutWin] = await Promise.all([
    app.waitForEvent('window'),
    win.locator('button:has-text("Pop out")').click()
  ])
  await popoutWin.waitForLoadState('domcontentloaded')
  await popoutWin.waitForTimeout(600)
  await popoutWin.screenshot({ path: path.join(SHOTS, 'notes-04-popout.png') })

  check(
    'main window shows the "open elsewhere" placeholder',
    await win.locator('text=This note').isVisible(),
    true
  )
  check('Pop out button is gone while popped out', await win.locator('button:has-text("Pop out")').count(), 0)

  const popCanvas = popoutWin.locator('canvas')
  const popBox = await popCanvas.boundingBox()
  await popoutWin.mouse.move(popBox.x + 15, popBox.y + 15)
  await popoutWin.mouse.down()
  await popoutWin.mouse.move(popBox.x + 80, popBox.y + 80, { steps: 5 })
  await popoutWin.mouse.up()
  await popoutWin.waitForTimeout(400)

  await popoutWin.close()
  await win.waitForTimeout(500)

  check(
    'main window canvas is back (placeholder gone)',
    await win.locator('text=This note').count(),
    0
  )
  const gameName = 'Popout Game'
  const savedNotes = readProfiles()[gameName].noteList
  check('the stroke drawn in the pop-out was saved to the right note', savedNotes[0].drawing.length, 1)

  console.log('\n=== L3: "Move to note" — empty target, then an overwrite confirm ===')
  // Add two more notes to Popout Game: "Target A" (empty) and "Target B"
  // (already has a stroke, to exercise the overwrite confirm).
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(300)
  await win.locator('button:has-text("New note")').click()
  await win.waitForTimeout(300)
  await win.locator('button[title="Click to rename"]').click()
  await win.locator('input[placeholder="Untitled note"]').fill('Target A')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(300)
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(300)

  await win.locator('button:has-text("New note")').click()
  await win.waitForTimeout(300)
  await win.locator('button[title="Click to rename"]').click()
  await win.locator('input[placeholder="Untitled note"]').fill('Target B')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(300)
  // Give Target B a stroke of its own so moving into it later must overwrite.
  const tbCanvas = win.locator('canvas')
  const tbBox = await tbCanvas.boundingBox()
  await win.mouse.move(tbBox.x + 10, tbBox.y + 10)
  await win.mouse.down()
  await win.mouse.move(tbBox.x + 40, tbBox.y + 40, { steps: 3 })
  await win.mouse.up()
  await win.waitForTimeout(400)
  await win.locator('button[aria-label="Back"]').click()
  await win.waitForTimeout(300)

  // Re-open the note that already has the drawing from the previous section
  // (still called "Untitled note" — the one popped out and drawn on above)
  // and pop it out again to drive the "Move to" dropdown.
  const drawnRow = win.locator('button:has-text("Untitled note")').first()
  await drawnRow.click()
  await win.waitForTimeout(300)

  const [popout2] = await Promise.all([
    app.waitForEvent('window'),
    win.locator('button:has-text("Pop out")').click()
  ])
  await popout2.waitForLoadState('domcontentloaded')
  await popout2.waitForTimeout(500)

  console.log('  moving to Target A (empty target, no confirm expected)')
  await popout2.locator('select').selectOption({ label: 'Target A' })
  await popout2.waitForTimeout(500)
  let profiles = readProfiles()
  const notesNow = profiles['Popout Game'].noteList
  const targetA = notesNow.find((n) => n.title === 'Target A')
  const untitled = notesNow.find((n) => n.title === 'Untitled Note')
  check('Target A now has the moved drawing', targetA?.drawing.length, 1)
  check('the original note is now empty', untitled?.drawing.length, 0)

  console.log('  moving to Target B (has a drawing already -> overwrite confirm)')
  let confirmMessage = null
  popout2.once('dialog', (d) => {
    confirmMessage = d.message()
    void d.accept()
  })
  await popout2.locator('select').selectOption({ label: 'Target B' })
  await popout2.waitForTimeout(500)
  check('a confirm dialog was shown before overwriting', typeof confirmMessage, 'string')
  check('the confirm mentions the target note', confirmMessage?.includes('Target B'), true)

  profiles = readProfiles()
  const targetB = profiles['Popout Game'].noteList.find((n) => n.title === 'Target B')
  const targetAAfter = profiles['Popout Game'].noteList.find((n) => n.title === 'Target A')
  check('Target B now has the (moved-again) drawing', targetB?.drawing.length, 1)
  check('Target A lost it, having been the source of the second move', targetAAfter?.drawing.length, 0)

  await popout2.close()
  await win.waitForTimeout(300)

  await app.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
