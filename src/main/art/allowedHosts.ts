import { net } from 'electron'

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
  'cdn1.unrealengine.com',
  // SteamGridDB, used only when the user supplies their own API key.
  'cdn2.steamgriddb.com',
  'cdn.steamgriddb.com'
])

/** A generous cap for artwork before it reaches Chromium or nativeImage. */
export const MAX_ART_RESPONSE_BYTES = 12 * 1024 * 1024
const ART_REQUEST_TIMEOUT_MS = 15_000

/** True only for an https URL on an allowlisted host. */
export function isAllowedArtUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return (
      url.protocol === 'https:' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      ALLOWED_ART_HOSTS.has(url.hostname)
    )
  } catch {
    return false
  }
}

function declaredSizeIsAllowed(value: string | null, maxBytes: number): boolean {
  if (!value) return true
  const size = Number(value)
  return Number.isSafeInteger(size) && size >= 0 && size <= maxBytes
}

/** Fetches only an approved art origin, rejects redirects, and applies a request timeout. */
export async function fetchAllowedArt(url: string, init: RequestInit = {}): Promise<Response | null> {
  if (!isAllowedArtUrl(url)) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ART_REQUEST_TIMEOUT_MS)
  try {
    const response = await net.fetch(url, { ...init, redirect: 'error', signal: controller.signal })
    return declaredSizeIsAllowed(response.headers.get('content-length'), MAX_ART_RESPONSE_BYTES)
      ? response
      : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** Reads an art response with a byte cap even when its server omits Content-Length. */
export async function readAllowedArtResponse(
  response: Response,
  maxBytes = MAX_ART_RESPONSE_BYTES
): Promise<Buffer | null> {
  if (!declaredSizeIsAllowed(response.headers.get('content-length'), maxBytes)) return null
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    return total > 0 ? Buffer.concat(chunks) : null
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

/** Common artwork download boundary for catalog, manual, and Steam artwork URLs. */
export async function downloadAllowedArt(url: string): Promise<Buffer | null> {
  const response = await fetchAllowedArt(url)
  return response?.ok ? readAllowedArtResponse(response) : null
}
