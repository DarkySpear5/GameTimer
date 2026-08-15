import type { SubCategory } from './types'

export function newSubCategory(id: string, name: string): SubCategory {
  return { id, name, seconds: 0 }
}

/**
 * Adds `deltaSeconds` to one sub-category's own total. Never mutates —
 * returns a new array, matching how `profile.subCategories = creditSubCategory(...)`
 * is reassigned at every call site.
 *
 * A delta of zero or less, or an id that doesn't match any category, is a
 * no-op that returns the input array unchanged (not a copy) — this is what
 * lets a session where nothing measurable happened, or a category deleted
 * out from under a still-pending prompt, fail silently instead of throwing.
 */
export function creditSubCategory(
  subCategories: SubCategory[],
  id: string,
  deltaSeconds: number
): SubCategory[] {
  if (deltaSeconds <= 0) return subCategories
  if (!subCategories.some((c) => c.id === id)) return subCategories
  return subCategories.map((c) => (c.id === id ? { ...c, seconds: c.seconds + deltaSeconds } : c))
}
