import { promises as fs, existsSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { dataStore } from './dataStore'
import { paths } from './paths'
import { timerEngine } from '../timer/timerEngine'
import { writeStatusLog } from '../statusLog/writeStatusLog'
import { todayDateString } from '../util/date'
import { saveCappedImage } from '../util/imageResize'
import { ICON_MAX_DIMENSION, BACKGROUND_MAX_DIMENSION } from '@shared/constants'
import type { Profile, Status } from '@shared/types'

function freshProfile(name: string): Profile {
  return {
    name,
    seconds: 0,
    iconFile: null,
    bgColor: null,
    bgImage: null,
    status: 'in_progress',
    statusAt: null,
    statusSeconds: null,
    genres: [],
    lastPlayed: null,
    startedDate: null,
    notes: '',
    rating: 0,
    sessionLog: []
  }
}

function requireProfile(name: string): Profile {
  const profile = dataStore.get().profiles[name]
  if (!profile) throw new Error(`No such profile: ${name}`)
  return profile
}

async function deleteFileIfExists(path: string | null, dir: string): Promise<void> {
  if (!path) return
  const full = join(dir, path)
  if (existsSync(full)) {
    try {
      await fs.unlink(full)
    } catch {
      // orphaned files are cosmetic, never fatal
    }
  }
}

export const profileService = {
  list(): Profile[] {
    return Object.values(dataStore.get().profiles)
  },

  async create(name: string): Promise<Profile> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Name cannot be empty')
    const data = dataStore.get()
    if (trimmed in data.profiles) throw new Error(`"${trimmed}" already exists`)
    data.profiles[trimmed] = freshProfile(trimmed)
    await dataStore.safeSave()
    void writeStatusLog()
    return data.profiles[trimmed]
  },

  async rename(oldName: string, newName: string): Promise<Profile> {
    const trimmed = newName.trim()
    const data = dataStore.get()
    if (!trimmed || trimmed === oldName) return requireProfile(oldName)
    if (trimmed in data.profiles) throw new Error(`"${trimmed}" already exists`)
    const profile = requireProfile(oldName)
    delete data.profiles[oldName]
    profile.name = trimmed
    data.profiles[trimmed] = profile
    if (data.lastSelected === oldName) data.lastSelected = trimmed
    timerEngine.renameActive(oldName, trimmed)
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },

  async delete(name: string): Promise<void> {
    const profile = requireProfile(name)
    timerEngine.stopActive(name)
    await deleteFileIfExists(profile.iconFile, paths.iconsDir())
    await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
    const data = dataStore.get()
    delete data.profiles[name]
    if (data.lastSelected === name) data.lastSelected = null
    await dataStore.safeSave()
    void writeStatusLog()
  },

  async duplicate(name: string): Promise<Profile> {
    // Checkpoint first so the copy reflects the live count while the original keeps running.
    timerEngine.checkpointOne(name)
    const original = requireProfile(name)
    const data = dataStore.get()

    let newName = `${name} (Copy)`
    let counter = 2
    while (newName in data.profiles) {
      newName = `${name} (Copy ${counter})`
      counter++
    }

    let newIconFile: string | null = null
    if (original.iconFile) {
      const oldPath = join(paths.iconsDir(), original.iconFile)
      if (existsSync(oldPath)) {
        newIconFile = `${randomUUID()}${extname(original.iconFile)}`
        try {
          await fs.mkdir(paths.iconsDir(), { recursive: true })
          await saveCappedImage(oldPath, join(paths.iconsDir(), newIconFile), ICON_MAX_DIMENSION)
        } catch {
          newIconFile = null
        }
      }
    }

    let newBgImage: string | null = null
    if (original.bgImage) {
      const oldPath = join(paths.backgroundsDir(), original.bgImage)
      if (existsSync(oldPath)) {
        newBgImage = `${randomUUID()}${extname(original.bgImage)}`
        try {
          await fs.mkdir(paths.backgroundsDir(), { recursive: true })
          await saveCappedImage(oldPath, join(paths.backgroundsDir(), newBgImage), BACKGROUND_MAX_DIMENSION)
        } catch {
          newBgImage = null
        }
      }
    }

    const copy: Profile = {
      name: newName,
      seconds: original.seconds,
      iconFile: newIconFile,
      bgColor: newBgImage ? null : original.bgColor,
      bgImage: newBgImage,
      status: original.status,
      statusAt: original.statusAt,
      statusSeconds: original.statusSeconds,
      genres: [...original.genres],
      lastPlayed: original.lastPlayed,
      startedDate: original.startedDate,
      notes: original.notes,
      rating: original.rating,
      // Copied, not reset: duplicate() clones seconds and the completion
      // snapshot too, so an empty log here would make the copy claim hours
      // of playtime across zero sessions. Spread so the two profiles never
      // share one array.
      sessionLog: [...original.sessionLog]
    }
    data.profiles[newName] = copy
    await dataStore.safeSave()
    void writeStatusLog()
    return copy
  },

  async setStatus(name: string, status: Status): Promise<Profile> {
    if (status !== 'in_progress' && timerEngine.isRunning(name)) {
      timerEngine.pause(name)
    }
    const profile = requireProfile(name)
    profile.status = status
    // Going back to In Progress deliberately leaves statusAt/statusSeconds
    // alone. They used to be nulled here, which meant one stray click on the
    // Complete button of an already-completed game permanently destroyed both
    // the date it was finished on and the playtime it was finished at — no
    // confirmation, no undo, and the numbers are unrecoverable because nothing
    // else records them. Nothing renders them while a game is In Progress (the
    // Data tab, the Modify dialog and the status log all gate on status), so
    // keeping them is invisible until the next real status change overwrites
    // them. That makes an accidental un-complete/re-complete round trip
    // lossless instead of destructive.
    if (status !== 'in_progress') {
      profile.statusAt = todayDateString()
      profile.statusSeconds = profile.seconds
    }
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },

  async setGenres(name: string, genres: string[]): Promise<Profile> {
    const profile = requireProfile(name)
    profile.genres = genres
    await dataStore.safeSave()
    return profile
  },

  async setRating(name: string, rating: 0 | 1 | 2 | 3 | 4 | 5): Promise<Profile> {
    const profile = requireProfile(name)
    profile.rating = rating
    await dataStore.safeSave()
    return profile
  },

  async setNotes(name: string, notes: string): Promise<Profile> {
    const profile = requireProfile(name)
    profile.notes = notes
    await dataStore.safeSave()
    return profile
  },

  async addRemoveTime(name: string, deltaSeconds: number, note?: string): Promise<Profile> {
    const profile = requireProfile(name)
    const removing = deltaSeconds < 0
    const magnitude = Math.abs(deltaSeconds)
    if (removing) {
      profile.seconds = Math.max(0, profile.seconds - magnitude)
    } else {
      profile.seconds += magnitude
      profile.lastPlayed = Date.now()
    }
    const trimmedNote = note?.trim()
    if (trimmedNote) {
      const hours = Math.floor(magnitude / 3600)
      const minutes = Math.floor((magnitude % 3600) / 60)
      const hm = hours ? `${hours}h ${minutes}m` : `${minutes}m`
      const sign = removing ? '-' : '+'
      const line = `[${todayDateString()}] ${sign}${hm} — ${trimmedNote}`
      profile.notes = profile.notes ? `${profile.notes}\n${line}` : line
    }
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },

  async resetTime(name: string): Promise<Profile> {
    const profile = requireProfile(name)
    profile.seconds = 0
    timerEngine.restartActiveIfRunning(name)
    await dataStore.safeSave()
    return profile
  },

  async setIconFile(name: string, sourcePath: string): Promise<Profile> {
    const profile = requireProfile(name)
    await fs.mkdir(paths.iconsDir(), { recursive: true })
    const fname = `${randomUUID()}${extname(sourcePath).toLowerCase() || '.png'}`
    await saveCappedImage(sourcePath, join(paths.iconsDir(), fname), ICON_MAX_DIMENSION)
    await deleteFileIfExists(profile.iconFile, paths.iconsDir())
    profile.iconFile = fname
    await dataStore.safeSave()
    return profile
  },

  async setBackgroundImage(name: string, sourcePath: string): Promise<Profile> {
    const profile = requireProfile(name)
    await fs.mkdir(paths.backgroundsDir(), { recursive: true })
    const fname = `${randomUUID()}${extname(sourcePath).toLowerCase() || '.png'}`
    await saveCappedImage(sourcePath, join(paths.backgroundsDir(), fname), BACKGROUND_MAX_DIMENSION)
    await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
    profile.bgImage = fname
    profile.bgColor = null
    await dataStore.safeSave()
    return profile
  },

  async setBackgroundColor(name: string, color: string): Promise<Profile> {
    const profile = requireProfile(name)
    await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
    profile.bgImage = null
    profile.bgColor = color
    await dataStore.safeSave()
    return profile
  },

  async clearBackground(name: string): Promise<Profile> {
    const profile = requireProfile(name)
    await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
    profile.bgImage = null
    profile.bgColor = null
    await dataStore.safeSave()
    return profile
  },

  async select(name: string | null): Promise<void> {
    dataStore.get().lastSelected = name
    await dataStore.safeSave()
  }
}
