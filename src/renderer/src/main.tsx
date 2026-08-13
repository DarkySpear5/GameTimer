import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DrawingPopoutApp } from './components/dialogs/notes/DrawingPopoutApp'
import { APP_DISPLAY_NAME } from '@shared/channel'
import './i18n/i18n'
import './styles/tailwind.css'

// L3's drawing pop-out is a second, much smaller window that reuses this same
// bundle rather than needing its own electron-vite entry point — main opens
// it at index.html#drawing-popout?profile=...&note=..., and that hash is the
// entire routing decision this file makes.
const isDrawingPopout = window.location.hash.startsWith('#drawing-popout')

// The window is frameless, so this never appears as a caption — but it IS what
// the taskbar and Alt-Tab show, and a dev install sitting beside the real one
// needs to be distinguishable there too. index.html can't do this itself; the
// name depends on the build channel. The pop-out sets its own, more specific
// title once it knows which note it's showing.
if (!isDrawingPopout) document.title = APP_DISPLAY_NAME

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isDrawingPopout ? <DrawingPopoutApp /> : <App />}</StrictMode>
)
