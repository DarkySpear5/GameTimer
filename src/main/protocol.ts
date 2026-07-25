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
 * Serves icons/backgrounds to the renderer as gt-asset://icons/<file> and
 * gt-asset://backgrounds/<file> — avoids piping image bytes through IPC as
 * base64 for every game's box art on every list render.
 */
export function registerAssetProtocolHandler(): void {
  protocol.handle(GT_ASSET_SCHEME, (request) => {
    const url = new URL(request.url)
    const kind = url.hostname
    const fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    const dir = kind === 'icons' ? paths.iconsDir() : kind === 'backgrounds' ? paths.backgroundsDir() : null
    if (!dir || !fileName || fileName.includes('..')) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(join(dir, fileName)).toString())
  })
}
