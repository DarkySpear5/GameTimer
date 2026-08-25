import { promises as fs } from 'fs'

/** Enough for two high-quality capped art assets plus profile history, while keeping import parsing bounded. */
export const MAX_GTPROFILE_BYTES = 40 * 1024 * 1024
export const MAX_LEGACY_IMPORT_BYTES = 64 * 1024 * 1024
export const MAX_IMPORT_IMAGE_BYTES = 12 * 1024 * 1024
export const MAX_LEGACY_PROFILES = 5_000

/** Reads exactly the size observed from the open file handle, avoiding an unbounded stat/read race. */
export async function readJsonFileWithinLimit<T>(filePath: string, maxBytes: number): Promise<T> {
  const handle = await fs.open(filePath, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > maxBytes) throw new Error('Import file exceeds the supported size limit')

    const buffer = Buffer.allocUnsafe(info.size)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (bytesRead === 0) throw new Error('Import file changed while being read')
      offset += bytesRead
    }
    return JSON.parse(buffer.toString('utf-8')) as T
  } finally {
    await handle.close()
  }
}

/** Bounds base64 before Buffer allocation and before the native image decoder receives it. */
export function decodeImportImage(encoded: string): Buffer {
  if (Buffer.byteLength(encoded, 'base64') > MAX_IMPORT_IMAGE_BYTES) {
    throw new Error('Imported image exceeds the supported size limit')
  }
  return Buffer.from(encoded, 'base64')
}
