import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { TitleBar } from './components/titlebar/TitleBar'
import { GameList } from './components/gamelist/GameList'
import { SelectedGameView } from './components/timerview/SelectedGameView'
import { DataTab } from './components/datatab/DataTab'
import { AboutTab } from './components/about/AboutTab'
import { ModifyDialog } from './components/dialogs/ModifyDialog'
import { NotesDialog } from './components/dialogs/NotesDialog'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { LegacyImportPrompt } from './components/dialogs/LegacyImportPrompt'
import { UpdatePrompt } from './components/dialogs/UpdatePrompt'
import { ToastHost } from './components/common/Toast'
import { useProfilesStore } from './state/profilesStore'
import { loadSettings } from './state/settingsStore'
import { startTimerTickSubscription } from './state/timerStore'
import { useUiStore } from './state/uiStore'

const TAB_KEYS = { timer: 'tab_game_timer', data: 'tab_data', about: 'tab_about' } as const

function App(): React.JSX.Element {
  const { t } = useTranslation()
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const dialog = useUiStore((s) => s.dialog)
  const dialogTarget = useUiStore((s) => s.dialogTarget)
  const closeDialog = useUiStore((s) => s.closeDialog)
  const openDialog = useUiStore((s) => s.openDialog)

  useEffect(() => {
    void (async () => {
      const [initial] = await Promise.all([window.api.app.getInitialData(), loadSettings()])
      useProfilesStore.getState().setAll(Object.values(initial.profiles))
      if (initial.lastSelected && initial.profiles[initial.lastSelected]) {
        useUiStore.getState().setSelected(initial.lastSelected)
      }
    })()
    startTimerTickSubscription()
  }, [])

  return (
    <div className="flex h-full flex-col text-text">
      <TitleBar />
      <div className="flex items-center justify-between border-b border-card/60 px-3 pt-2">
        <div className="flex gap-1">
          {(Object.keys(TAB_KEYS) as (keyof typeof TAB_KEYS)[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-card text-accent' : 'text-subtext hover:text-text'
              }`}
            >
              {t(TAB_KEYS[tab])}
            </button>
          ))}
        </div>
        <button
          onClick={() => openDialog('settings')}
          aria-label={t('settings_title')}
          className="mb-1 rounded p-2 text-text hover:bg-card hover:text-accent"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      {activeTab === 'timer' && (
        <div className="flex flex-1 overflow-hidden">
          <GameList />
          <SelectedGameView />
        </div>
      )}
      {activeTab === 'data' && <DataTab />}
      {activeTab === 'about' && <AboutTab />}

      {dialog === 'modify' && dialogTarget && <ModifyDialog name={dialogTarget} onClose={closeDialog} />}
      {dialog === 'notes' && dialogTarget && <NotesDialog name={dialogTarget} onClose={closeDialog} />}
      {dialog === 'settings' && <SettingsDialog onClose={closeDialog} />}

      <LegacyImportPrompt />
      <UpdatePrompt />
      <ToastHost />
    </div>
  )
}

export default App
