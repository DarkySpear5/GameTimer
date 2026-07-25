import { promises as fs } from 'fs'
import { paths } from '../store/paths'

export interface FirstRunState {
  legacyImportState: 'imported' | 'skipped' | 'none-found'
  importedFromPath?: string
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
