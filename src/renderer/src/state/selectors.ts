import type { Profile, SortMode, Status } from '@shared/types'

/**
 * Originally mirrored v1's _get_sorted_filtered_profiles / _sort_profile_items
 * exactly; v3 adds Z-A, playtime and favourites to the same one place, so the
 * sidebar list and the Library grid can never disagree about an ordering.
 *
 * `running` is only consulted by the playtime comparator. It is optional
 * because every other mode is a pure function of the stored profiles, and a
 * caller that isn't sorting by playtime should not have to subscribe to a
 * record that changes twice a second just to call this.
 */
export function sortAndFilterProfiles(
  profiles: Record<string, Profile>,
  sortMode: SortMode,
  genreFilter: string,
  statusFilter: 'All' | Status,
  running: Record<string, number> = {}
): Profile[] {
  let list = Object.values(profiles)

  if (genreFilter !== 'All') {
    list = list.filter((p) => p.genres.includes(genreFilter))
  }
  if (statusFilter !== 'All') {
    list = list.filter((p) => p.status === statusFilter)
  }

  const byName = (a: Profile, b: Profile): number => a.name.localeCompare(b.name)

  // Every comparator falls through to byName on a tie. Without that, ties order
  // arbitrarily and the list appears to reshuffle itself whenever anything
  // unrelated updates — which looks like a bug and is impossible to explain.
  switch (sortMode) {
    case 'name_desc':
      list.sort((a, b) => -byName(a, b))
      break
    case 'last_played':
      list.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || byName(a, b))
      break
    // Deliberately the *displayed* seconds, not the stored ones: a game that is
    // running right now has uncommitted time, and sorting it by profile.seconds
    // would park it at its position from whenever the timer last checkpointed.
    case 'playtime':
      list.sort((a, b) => displaySeconds(b, running) - displaySeconds(a, running) || byName(a, b))
      break
    case 'favorite':
      list.sort((a, b) => Number(b.favorite) - Number(a.favorite) || byName(a, b))
      break
    case 'rating':
      list.sort((a, b) => b.rating - a.rating || byName(a, b))
      break
    case 'genre':
      list.sort((a, b) => a.genres.join(', ').localeCompare(b.genres.join(', ')) || byName(a, b))
      break
    case 'platform':
      list.sort((a, b) => platformRank(a) - platformRank(b) || byName(a, b))
      break
    case 'name':
    default:
      list.sort(byName)
  }

  return list
}

/**
 * The storefront a game came from, in the order the user asked for:
 * Steam → Xbox → Epic → EA → Battle.net → GOG → Nexon → everything else.
 *
 * A profile does not record its source — it records how to START it, which is
 * the same information seen from the other side. A Steam appid means Steam; a
 * launch URI names its launcher in the scheme; anything left is a bare
 * executable or a manually added game, and those sort last together.
 */
const PLATFORM_ORDER = ['steam', 'xbox', 'epic', 'ea', 'battlenet', 'gog', 'nexon']

export function platformRank(profile: Profile): number {
  if (profile.steamAppId != null) return 0
  const uri = profile.launchUri ?? ''
  if (uri.startsWith('shell:appsFolder')) return PLATFORM_ORDER.indexOf('xbox')
  if (uri.startsWith('com.epicgames.launcher:')) return PLATFORM_ORDER.indexOf('epic')
  if (uri.startsWith('origin2:') || uri.startsWith('link2ea:')) return PLATFORM_ORDER.indexOf('ea')
  if (uri.startsWith('battlenet:')) return PLATFORM_ORDER.indexOf('battlenet')
  if (uri.startsWith('goggalaxy:')) return PLATFORM_ORDER.indexOf('gog')
  if (uri.startsWith('nxl:')) return PLATFORM_ORDER.indexOf('nexon')
  return PLATFORM_ORDER.length
}

/**
 * Free-text match over a game's name and its genres. Case- and
 * punctuation-insensitive, so "hollow knight" finds "Hollow Knight" and
 * "deadby" finds "Dead by Daylight".
 */
export function matchesSearch(profile: Profile, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!q) return true
  const haystack = (profile.name + ' ' + profile.genres.join(' ')).toLowerCase().replace(/[^a-z0-9]/g, '')
  return haystack.includes(q)
}

/** Live seconds for display: committed `seconds` plus whatever the running timer's ticked since the last checkpoint. */
export function displaySeconds(profile: Profile, running: Record<string, number>): number {
  return running[profile.name] ?? profile.seconds
}
