/**
 * The only hosts Gamut will fetch images from.
 *
 * Shared by the renderer's thumbnail proxy (protocol.ts) and by the code that
 * downloads a chosen image (enrich.ts). Both need it for the same reason: a
 * URL that reaches either one has passed through the renderer, and "fetch
 * whatever you are handed" in the main process is a request-forgery primitive
 * regardless of how trustworthy the caller is meant to be.
 */
export const ALLOWED_ART_HOSTS = new Set([
  'cdn.cloudflare.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'shared.fastly.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'store.akamai.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'images.gog-statics.com',
  // Epic's storefront art, for games Steam has delisted or never carried.
  'cdn1.epicgames.com',
  'cdn2.unrealengine.com',
  'cdn1.unrealengine.com'
])

/** True only for an https URL on an allowlisted host. */
export function isAllowedArtUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && ALLOWED_ART_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}
