/**
 * A .gtprofile is a file you are meant to hand to someone else, so everything
 * inside it is attacker-controlled input.
 *
 * The image extension used to be taken from the file verbatim and pasted into
 * a path: join(iconsDir, `${uuid}${imported.iconExt}`). An extension of
 * "/../../../Start Menu/Programs/Startup/x.bat" therefore escaped the icons
 * directory entirely — and because saveCappedImageBuffer writes the source
 * bytes through unchanged when they do not decode as an image, the attacker
 * chose the file's contents too. Importing a shared profile could drop an
 * arbitrary file anywhere the user's account could write.
 */
const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'])

const SEPARATORS = ['/', '\\', '..', ':']

/**
 * Normalises an untrusted image extension to one of a known-safe set.
 * Anything containing a path separator, anything unrecognised, anything
 * absent — all become '.png'. No legitimate .gtprofile is rejected by this.
 */
export function safeImageExt(raw: unknown): string {
  if (typeof raw !== 'string') return '.png'
  const ext = raw.trim().toLowerCase()
  if (SEPARATORS.some((sep) => ext.includes(sep))) return '.png'
  return ALLOWED.has(ext) ? ext : '.png'
}
