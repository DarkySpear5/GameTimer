import { promises as fs } from 'fs'
import { dialog } from 'electron'
import type { AppData } from '@shared/types'
import { paths } from './paths'
import { freshAppData, parseAppData } from './schema'

/**
 * In-memory singleton mirroring v1's single `self.data` dict — every other
 * main-process module (timer engine, IPC handlers, status log) mutates the
 * object returned by get() directly and calls save() when it needs to
 * persist, exactly like the Tkinter app's direct-dict-mutation style.
 */
class DataStore {
  private data: AppData | null = null
  // Every save() call chains onto this so writes are strictly sequential —
  // without it, two overlapping saves (e.g. a font-scale slider or color
  // picker firing onChange many times per second while dragging) both
  // write/rename the same .tmp path concurrently, and the loser's rename
  // throws ENOENT because the winner already moved the file out from under
  // it. This was surfacing as a real "couldn't save your data" error dialog.
  private saveChain: Promise<void> = Promise.resolve()

  async load(): Promise<AppData> {
    try {
      const raw = await fs.readFile(paths.dataFile(), 'utf-8')
      this.data = parseAppData(JSON.parse(raw))
    } catch {
      this.data = freshAppData()
    }
    return this.data
  }

  get(): AppData {
    if (!this.data) throw new Error('DataStore.load() must be awaited before use')
    return this.data
  }

  /** Atomic write (temp file + rename), serialized so concurrent callers never race on the same .tmp file. */
  async save(): Promise<void> {
    const next = this.saveChain.then(() => this.writeToDisk())
    // Swallow here so one failed save doesn't poison the chain for every
    // save after it — each caller still awaits/catches its own `next`.
    this.saveChain = next.catch(() => undefined)
    return next
  }

  private async writeToDisk(): Promise<void> {
    if (!this.data) return
    await fs.mkdir(paths.root(), { recursive: true })
    const tmp = paths.dataFileTmp()
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    await fs.rename(tmp, paths.dataFile())
  }

  /**
   * Used by user-initiated mutations (create/rename/delete/status/etc.) —
   * surfaces a real error dialog on failure, matching v1's _safe_save().
   * Periodic background saves (timer checkpoints, quit) call save()
   * directly and swallow failures instead, since a dialog popping up every
   * 5 seconds would be its own kind of broken.
   */
  async safeSave(): Promise<void> {
    try {
      await this.save()
    } catch (err) {
      dialog.showErrorBox(
        "Can't save",
        `Game Timer couldn't save your data.\n\n${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}

export const dataStore = new DataStore()
