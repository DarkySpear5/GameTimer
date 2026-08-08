import { GENRE_OPTIONS } from '@shared/constants'

/**
 * Turns a game's tags from an external source into Gamut's own genre list.
 *
 * Steam's *store genres* (the appdetails endpoint) are far too coarse to be
 * useful — DOOM Eternal comes back as simply "Action". Steam's *user tags*,
 * which SteamSpy exposes, are the same vocabulary Gamut's list was written in:
 * that same game returns FPS, Action, Gore, Shooter, Sci-fi, which is exactly
 * how a person would tag it.
 *
 * Most tags therefore need no table at all — normalising punctuation and case
 * makes "Sci-fi"/"Sci-Fi", "Story Rich"/"Story-Rich" and "Souls-like"/
 * "Soulslike" the same string. The alias table is only for the genuine
 * mismatches.
 */

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

const CANONICAL = new Map(GENRE_OPTIONS.map((g) => [normalize(g), g]))

/** Only the tags whose wording differs from Gamut's beyond punctuation. */
const ALIASES: Record<string, string> = {
  farmingsim: 'Farming',
  agriculture: 'Farming',
  thirdperson: '3rd Person',
  firstperson: 'FPS',
  massivelymultiplayer: 'MMO',
  mmorpg: 'MMO',
  cardgame: 'Card / Board Game',
  boardgame: 'Card / Board Game',
  cardbattler: 'Deckbuilding',
  turnbasedstrategy: 'Turn-Based',
  turnbasedcombat: 'Turn-Based',
  turnbasedtactics: 'Turn-Based',
  roguelite: 'Roguelike',
  roguelike: 'Roguelike',
  violent: 'Gore',
  blood: 'Gore',
  nudity: 'Adult',
  sexualcontent: 'Adult',
  survivalhorror: 'Horror',
  psychologicalhorror: 'Horror',
  spacesim: 'Space',
  openworldsurvivalcraft: 'Open World',
  automobilesim: 'Racing',
  jrpg: 'RPG',
  actionrpg: 'RPG',
  crpg: 'RPG',
  arcade: 'Retro',
  pixelgraphics: 'Retro',
  soulslike: 'Soulslike',
  bullethell: 'Bullet Hell',
  towerdefense: 'Tower Defense',
  lootershooter: 'Looter Shooter',
  hackandslash: 'Hack and Slash',
  visualnovel: 'Visual Novel',
  dungeoncrawler: 'Dungeon Crawler',
  lifesim: 'Life-Sim',
  storyrich: 'Story-Rich',
  multipleendings: 'Multiple Endings',
  scifi: 'Sci-Fi'
}

/**
 * Maps and de-duplicates, dropping anything with no Gamut equivalent rather
 * than inventing one. Capped because these sources return a long tail —
 * fourteen tags on a game is noise, and the first few are the ones ranked
 * highest by actual players.
 */
export function mapTagsToGenres(tags: string[], limit = 6): string[] {
  const out: string[] = []
  for (const tag of tags) {
    const key = normalize(tag)
    const genre = CANONICAL.get(key) ?? ALIASES[key]
    if (genre && !out.includes(genre)) out.push(genre)
    if (out.length >= limit) break
  }
  return out
}
