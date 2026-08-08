import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Baked into main and renderer as __GAMUT_CHANNEL__ (see src/shared/channel.ts).
// `npm run package:dev` sets GAMUT_CHANNEL=dev to produce the side-by-side dev
// build; anything else is the public one. Not exposed to preload, which has no
// need for it.
const channel = process.env.GAMUT_CHANNEL === 'dev' ? 'dev' : 'stable'
const channelDefine = { __GAMUT_CHANNEL__: JSON.stringify(channel) }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: channelDefine,
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    define: channelDefine,
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
