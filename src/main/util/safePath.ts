import { basename, resolve } from 'path'
import { safeImageExt } from '../importer/safeExt'

/**
 * Filename hygiene for anything that arrives from outside the app — v1 data
 * files and .gtprofile files are both user-supplied, and both are meant to be
 * moved between machines, so neither can be trusted.
 *
 * The v1 importer used a name straight out of the imported JSON for BOTH the
 * source path it read and the destination it wrote:
 *
 *   read:  join(legacyDir, 'icons', name)   -> "../../../../Windows/..."
 *   write: join(iconsDir,  name)            -> "../../../Startup/x.bat"
 *
 * giving an arbitrary read and an arbitrary write from one crafted file.
 */

/**
 * Reduces an untrusted asset name to a plain filename in a known-safe format:
 * no directory components, no traversal, and an image extension from the
 * allowlist. Returns null when nothing usable is left.
 */
export function safeAssetFileName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // basename() on both separators — a Windows-style name can reach a Node
  // process whose path module is treating '/' as the separator and vice versa.
  const flattened = basename(raw.replace(/\\/g, '/'))
  if (!flattened || flattened === '.' || flattened === '..') return null

  const dot = flattened.lastIndexOf('.')
  const stem = dot > 0 ? flattened.slice(0, dot) : flattened
  const ext = dot > 0 ? flattened.slice(dot) : ''
  // Strip anything that is not obviously part of a filename. UUIDs, which is
  // what v1 actually wrote, survive this untouched.
  const cleanStem = stem.replace(/[^A-Za-z0-9._-]/g, '')
  if (!cleanStem) return null

  return cleanStem + safeImageExt(ext)
}

/**
 * Last line of defence: confirms a path really does sit inside the directory
 * it is supposed to. Cheap, and it catches anything a future change to the
 * name-cleaning above might let through.
 */
export function isInside(dir: string, target: string): boolean {
  const root = resolve(dir)
  const full = resolve(target)
  return full === root || full.startsWith(root + '\\') || full.startsWith(root + '/')
}
