import type { SubCategory } from './types'

export function newSubCategory(id: string, name: string): SubCategory {
  return { id, name, seconds: 0 }
}

/**
 * Adds (or, for a negative delta, subtracts) `deltaSeconds` from one
 * sub-category's own total. Never mutates — returns a new array, matching
 * how `profile.subCategories = creditSubCategory(...)` is reassigned at
 * every call site.
 *
 * A delta of exactly zero, or an id that doesn't match any category, is a
 * no-op that returns the input array unchanged (not a copy) — this is what
 * lets a session where nothing measurable happened, or a category deleted
 * out from under a still-pending prompt, fail silently instead of throwing.
 *
 * A negative delta that would take a category below zero clamps at zero
 * instead, matching the floor `addRemoveTime` already enforces on the main
 * total. Each category clamps independently — removing more than one
 * category has never affects any other category, or how much the main
 * total itself loses.
 */
export function creditSubCategory(
  subCategories: SubCategory[],
  id: string,
  deltaSeconds: number
): SubCategory[] {
  if (deltaSeconds === 0) return subCategories
  if (!subCategories.some((c) => c.id === id)) return subCategories
  return subCategories.map((c) =>
    c.id === id ? { ...c, seconds: Math.max(0, c.seconds + deltaSeconds) } : c
  )
}
