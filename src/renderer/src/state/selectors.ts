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
    case 'name':
    default:
      list.sort(byName)
  }

  return list
}

/** Live seconds for display: committed `seconds` plus whatever the running timer's ticked since the last checkpoint. */
export function displaySeconds(profile: Profile, running: Record<string, number>): number {
  return running[profile.name] ?? profile.seconds
}
