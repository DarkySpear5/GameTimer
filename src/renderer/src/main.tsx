import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { APP_DISPLAY_NAME } from '@shared/channel'
import './i18n/i18n'
import './styles/tailwind.css'

// The window is frameless, so this never appears as a caption — but it IS what
// the taskbar and Alt-Tab show, and a dev install sitting beside the real one
// needs to be distinguishable there too. index.html can't do this itself; the
// name depends on the build channel.
document.title = APP_DISPLAY_NAME

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
