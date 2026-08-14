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

const args = process.argv.slice(2)
const forcePixel = args.includes('--pixel')
const forceSmooth = args.includes('--smooth')
const source = args.find((a) => !a.startsWith('--'))
if (!source || !fs.existsSync(source)) {
  console.error('Usage: node scripts/build-icons.cjs <source image> [--pixel|--smooth]')
  process.exit(1)
}
if (forcePixel && forceSmooth) {
  console.error('--pixel and --smooth are mutually exclusive')
  process.exit(1)
}

const MAGICK = findMagick()
const BUILD = path.join(__dirname, '..', 'build')
const TMP = path.join(BUILD, '.icon-tmp')
const run = (args) => execFileSync(MAGICK, args, { stdio: 'inherit' })

fs.mkdirSync(TMP, { recursive: true })

/**
 * The frame to build from.
 *
 * A .ico is a CONTAINER — the one supplied here held 16/32/64/128/256 — and
 * handing the whole file to convert makes ImageMagick write one PNG per frame
 * (source-0.png, source-1.png, …), so the single `source.png` the rest of this
 * script expects never appears. Picking the largest frame explicitly is both
 * the fix and the right choice: every output size is derived by scaling DOWN
 * from the most detailed artwork available.
 *
 * A single-frame source (.png, or a one-size .ico) reports one line and takes
 * index 0, so this costs nothing in the ordinary case.
 */
function largestFrame(file) {
  const out = execFileSync(MAGICK, ['identify', '-format', '%w %h %s\\n', file], {
    encoding: 'utf-8'
  })
  const frames = out
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [w, h, index] = line.trim().split(/\s+/).map(Number)
      return { w, h, index: Number.isFinite(index) ? index : 0 }
    })
    .filter((f) => Number.isFinite(f.w) && Number.isFinite(f.h))
  if (frames.length === 0) throw new Error(`could not read any frame from ${file}`)
  const best = frames.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a))
  if (frames.length > 1) {
    console.log(`source has ${frames.length} frames; using the largest (${best.w}x${best.h})`)
  }
  return { spec: `${file}[${best.index}]`, size: best.w }
}

const { spec: sourceFrame, size: sourceSize } = largestFrame(source)

const PIXEL_ART = forcePixel || (!forceSmooth && sourceSize < 128)
console.log(
  `treating source as ${PIXEL_ART ? 'PIXEL ART (nearest neighbour)' : 'SMOOTH artwork (Lanczos)'}` +
    `${forcePixel || forceSmooth ? ' [forced]' : ` — inferred from ${sourceSize}px source`}`
)

// Flatten to a known-good RGBA PNG first; .ico input can be BMP-in-ICO.
const flat = path.join(TMP, 'source.png')
run([sourceFrame, '-background', 'none', '-alpha', 'on', flat])

/**
 * Downscales one size.
 *
 * Which filter is right depends entirely on the artwork, and getting it
 * backwards is very visible:
 *
 *   pixel art  -> point (nearest neighbour). A smooth filter blurs hard pixel
 *                 edges into mush. Small sizes are supersampled first (point up
 *                 to 384, good filter down), because dropping pixels to reach
 *                 16px from a 24px source loses whole features.
 *   smooth art -> Lanczos throughout. Nearest neighbour on anti-aliased curves
 *                 and gradients drops every intermediate pixel, so thin strokes
 *                 break into dashes and edges turn jagged.
 *
 * Default is chosen from the source size: pixel art is authored small, so a
 * source of 128px or more is treated as smooth artwork. Override either way
 * with --pixel or --smooth.
 */
function render(size, out) {
  if (PIXEL_ART) {
    if (size >= 32) {
      run([flat, '-filter', 'point', '-resize', `${size}x${size}`, out])
    } else {
      run([flat, '-filter', 'point', '-resize', '384x384', '-filter', 'Lanczos', '-resize', `${size}x${size}`, out])
    }
    return
  }
  run([flat, '-filter', 'Lanczos', '-resize', `${size}x${size}`, out])
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
