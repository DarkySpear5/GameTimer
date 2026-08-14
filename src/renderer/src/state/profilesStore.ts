import { create } from 'zustand'
import type { Profile } from '@shared/types'

interface ProfilesState {
  profiles: Record<string, Profile>
  loaded: boolean
  setAll: (profiles: Profile[]) => void
  upsert: (profile: Profile) => void
  remove: (name: string) => void
  rename: (oldName: string, profile: Profile) => void
}

export const useProfilesStore = create<ProfilesState>((set) => ({
  profiles: {},
  loaded: false,
  setAll: (profiles) =>
    set({
      profiles: Object.fromEntries(profiles.map((p) => [p.name, p])),
      loaded: true
    }),
  upsert: (profile) => set((s) => ({ profiles: { ...s.profiles, [profile.name]: profile } })),
  remove: (name) =>
    set((s) => {
      const next = { ...s.profiles }
      delete next[name]
      return { profiles: next }
    }),
  rename: (oldName, profile) =>
    set((s) => {
      const next = { ...s.profiles }
      delete next[oldName]
      next[profile.name] = profile
      return { profiles: next }
    })
}))

export async function loadProfiles(): Promise<void> {
  const profiles = await window.api.profiles.list()
  useProfilesStore.getState().setAll(profiles)
}

let unsubscribeChanged: (() => void) | null = null

/**
 * Without this, a profile the MAIN process mutates on its own (gameWatcher's
 * background auto-pause, launch/openSeconds accrual) never reaches this
 * store — every other update path is a renderer-initiated IPC call that
 * already gets the fresh Profile back directly. Concretely: closing a game
 * with auto-start-timer on would auto-pause it, correctly saving the final
 * `seconds` to disk, but the Library kept showing whatever `seconds` this
 * store last cached — stale until the next full app relaunch.
 */
export function startProfilesChangeSubscription(): void {
  if (unsubscribeChanged) return
  unsubscribeChanged = window.api.profiles.onChanged((profiles) => {
    const store = useProfilesStore.getState()
    for (const profile of profiles) store.upsert(profile)
  })
}
