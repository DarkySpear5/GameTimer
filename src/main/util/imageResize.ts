import { promises as fs } from 'fs'
import { extname } from 'path'
import { nativeImage } from 'electron'

/**
 * Copies an imported icon/background image to its destination, downscaling
 * first if it's larger than needed. Icons only ever render up to
 * ICON_SIZE_OPTIONS['Extra Large'] (72px) and backgrounds fill at most the
 * main content pane, so anything beyond these caps is pixels Chromium has
 * to decode and hold in memory for zero visible benefit — a 512x512 icon
 * shown at 72px, or an uploaded 4K wallpaper, both cost real RAM for no
 * screen-visible difference. Caps are generous relative to actual on-screen
 * size specifically so there's no perceptible quality loss, even on a
 * HiDPI display.
 *
 * Uses Electron's built-in nativeImage rather than adding an image library
 * (sharp/jimp) as a dependency — it's already used elsewhere in this
 * project for tray/window icons, and native-binding deps have caused real
 * packaging pain on this machine before (see @tailwindcss/oxide gotcha).
 *
 * If the source is already within the cap, it's copied byte-for-byte
 * instead of being re-encoded, so a small icon/background never loses
 * quality it didn't need to.
 */
export async function saveCappedImage(
  sourcePath: string,
  destPath: string,
  maxDimension: number
): Promise<void> {
  const img = nativeImage.createFromPath(sourcePath)
  const { width, height } = img.getSize()

  // A source that does not decode is not an image; copying it through
  // verbatim would put arbitrary bytes on disk under an image's name.
  if (img.isEmpty() || width === 0 || height === 0) {
    throw new Error('Not a usable image')
  }

  if (width <= maxDimension && height <= maxDimension) {
    await fs.copyFile(sourcePath, destPath)
    return
  }

  const scale = maxDimension / Math.max(width, height)
  const resized = img.resize({
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    quality: 'best'
  })

  const ext = extname(destPath).toLowerCase()
  const buffer = ext === '.jpg' || ext === '.jpeg' ? resized.toJPEG(92) : resized.toPNG()
  await fs.writeFile(destPath, buffer)
}

/** Same as saveCappedImage, but for an in-memory buffer (.gtprofile import, where the image arrives base64-embedded rather than as a file on disk). */
export async function saveCappedImageBuffer(
  sourceBuffer: Buffer,
  destPath: string,
  maxDimension: number
): Promise<void> {
  const img = nativeImage.createFromBuffer(sourceBuffer)
  const { width, height } = img.getSize()

  // Anything that does not decode is not an image, and writing it through
  // unchanged is what let a crafted import choose the bytes on disk as well as
  // their location. An import that isn't an image simply fails.
  if (img.isEmpty() || width === 0 || height === 0) {
    throw new Error('Not a usable image')
  }

  if (width <= maxDimension && height <= maxDimension) {
    await fs.writeFile(destPath, sourceBuffer)
    return
  }

  const scale = maxDimension / Math.max(width, height)
  const resized = img.resize({
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    quality: 'best'
  })

  const ext = extname(destPath).toLowerCase()
  const buffer = ext === '.jpg' || ext === '.jpeg' ? resized.toJPEG(92) : resized.toPNG()
  await fs.writeFile(destPath, buffer)
}
