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
