import { promises as fs } from 'fs'
import { paths } from '../store/paths'

export interface FirstRunState {
  legacyImportState: 'imported' | 'skipped' | 'none-found'
  importedFromPath?: string
  /**
   * Whether the "add the games already installed on this PC" offer has been
   * made. Absent in files written before v3, which is correctly read as "not
   * yet asked" — an existing user gets the offer once, on their next launch.
   */
  installedScanState?: 'imported' | 'skipped'
}

/**
 * Merges into whatever is already on disk instead of replacing it.
 *
 * This file is written by two independent first-run flows now, and a plain
 * overwrite would let whichever ran second erase the other's record — so the
 * legacy-import prompt would reappear after the game scan, or vice versa.
 */
export async function updateFirstRunState(patch: Partial<FirstRunState>): Promise<void> {
  const current = await readFirstRunState()
  await writeFirstRunState({ legacyImportState: 'none-found', ...current, ...patch })
}

export async function readFirstRunState(): Promise<FirstRunState | null> {
  try {
    return JSON.parse(await fs.readFile(paths.firstRunFile(), 'utf-8'))
  } catch {
    return null
  }
}

export async function writeFirstRunState(state: FirstRunState): Promise<void> {
  await fs.mkdir(paths.root(), { recursive: true })
  await fs.writeFile(paths.firstRunFile(), JSON.stringify(state, null, 2), 'utf-8')
}
