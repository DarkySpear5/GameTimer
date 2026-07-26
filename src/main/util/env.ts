import { join } from 'path'
import { app } from 'electron'

export const is = {
  dev: !!process.env['ELECTRON_RENDERER_URL'] || process.defaultApp === true
}

/**
 * Resolves a static asset shipped from `build/` at dev time. In a packaged
 * build, `build/` isn't inside the asar — electron-builder.yml copies these
 * specific files to the app's resources dir instead (see `extraResources`),
 * so the packaged path reads from `process.resourcesPath` instead.
 */
export function resolveAsset(fileName: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, fileName)
    : join(__dirname, '../../build', fileName)
}
