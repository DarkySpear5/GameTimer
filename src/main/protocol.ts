import { net, protocol } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { paths } from './store/paths'

export const GT_ASSET_SCHEME = 'gt-asset'

/** Must be called before app.whenReady(). */
export function registerAssetSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: GT_ASSET_SCHEME, privileges: { secure: true, supportFetchAPI: true } }
  ])
}

/**
 * Hosts the art picker is allowed to preview from. An allowlist rather than
 * "any https URL" on purpose: the renderer's CSP deliberately forbids remote
 * images, and relaxing it to `https:` would let anything rendered in the app
 * reach any server. Proxying through here keeps that door shut while still
 * letting the picker show real thumbnails.
 */
const ALLOWED_REMOTE_HOSTS = new Set([
  'cdn.cloudflare.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'shared.fastly.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'store.akamai.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'images.gog-statics.com'
])

/**
 * Serves icons/backgrounds to the renderer as gt-asset://icons/<file> and
 * gt-asset://backgrounds/<file> — avoids piping image bytes through IPC as
 * base64 for every game's box art on every list render.
 *
 * Also proxies art-picker thumbnails at gt-asset://remote/<encoded-url>, so
 * the renderer never makes a network request of its own.
 */
export function registerAssetProtocolHandler(): void {
  protocol.handle(GT_ASSET_SCHEME, (request) => {
    const url = new URL(request.url)
    const kind = url.hostname

    if (kind === 'remote') {
      const target = decodeURIComponent(url.pathname.replace(/^\/+/, '')) + url.search
      let parsed: URL
      try {
        parsed = new URL(target)
      } catch {
        return new Response('Bad request', { status: 400 })
      }
      if (parsed.protocol !== 'https:' || !ALLOWED_REMOTE_HOSTS.has(parsed.hostname)) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(parsed.toString())
    }

    const fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    const dir = kind === 'icons' ? paths.iconsDir() : kind === 'backgrounds' ? paths.backgroundsDir() : null
    if (!dir || !fileName || fileName.includes('..')) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(join(dir, fileName)).toString())
  })
}
