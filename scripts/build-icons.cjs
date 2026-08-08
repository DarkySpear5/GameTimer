/*
 * Regenerates build/icon.ico and the two tray PNGs from one source image.
 *
 * The tray icons were previously hand-rendered once and committed with no
 * recipe, which meant a new app icon was a manual job every time. This is that
 * recipe.
 *
 *   node scripts/build-icons.cjs <source image>
 *
 * Scaling is deliberately split. The source artwork is pixel art, so the large
 * icon sizes use nearest-neighbour ("point") to keep the pixels crisp — a
 * smooth filter turns pixel art into mush. The small sizes go the other way:
 * dropping pixels to reach 16px from a 24px source loses whole features, so
 * those are supersampled (point up to 8x, then a good filter down), which
 * preserves the shapes while staying legible.
 *
 * Requires ImageMagick, which is already how this project renders icons.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const MAGICK_CANDIDATES = [
  'magick',
  'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
  'C:\\Program Files\\ImageMagick-7.1.1-Q16-HDRI\\magick.exe'
]

function findMagick() {
  for (const candidate of MAGICK_CANDIDATES) {
    try {
      execFileSync(candidate, ['-version'], { stdio: 'ignore' })
      return candidate
    } catch {
      /* try the next one */
    }
  }
  throw new Error('ImageMagick not found. Install it, or add magick.exe to PATH.')
}

const source = process.argv[2]
if (!source || !fs.existsSync(source)) {
  console.error('Usage: node scripts/build-icons.cjs <source image>')
  process.exit(1)
}

const MAGICK = findMagick()
const BUILD = path.join(__dirname, '..', 'build')
const TMP = path.join(BUILD, '.icon-tmp')
const run = (args) => execFileSync(MAGICK, args, { stdio: 'inherit' })

fs.mkdirSync(TMP, { recursive: true })

// Flatten to a known-good RGBA PNG first; .ico input can be BMP-in-ICO.
const flat = path.join(TMP, 'source.png')
run([source, '-background', 'none', '-alpha', 'on', flat])

/** Crisp for anything at or above the source size, supersampled below it. */
function render(size, out) {
  if (size >= 32) {
    run([flat, '-filter', 'point', '-resize', `${size}x${size}`, out])
  } else {
    run([flat, '-filter', 'point', '-resize', '384x384', '-filter', 'Lanczos', '-resize', `${size}x${size}`, out])
  }
}

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const pngs = SIZES.map((size) => {
  const out = path.join(TMP, `icon-${size}.png`)
  render(size, out)
  return out
})

run([...pngs, path.join(BUILD, 'icon.ico')])
console.log(`\nicon.ico written with ${SIZES.length} sizes: ${SIZES.join(', ')}`)

// Tray: 32px, and a "running" variant badged in the bottom-right corner. The
// badge is composited here rather than drawn at runtime so the main process
// never does image work just to change a tray icon.
const trayIdle = path.join(BUILD, 'tray-idle.png')
render(32, trayIdle)

const badge = path.join(TMP, 'badge.png')
run([
  '-size', '32x32', 'xc:none',
  '-fill', '#22c55e', '-stroke', '#0b3d1c', '-strokewidth', '1',
  '-draw', 'circle 22,22 22,15',
  '-fill', '#ffffff', '-stroke', 'none',
  '-draw', 'polygon 19,18 19,26 27,22',
  badge
])
run([trayIdle, badge, '-composite', path.join(BUILD, 'tray-running.png')])
console.log('tray-idle.png and tray-running.png written (32x32)')

fs.rmSync(TMP, { recursive: true, force: true })
