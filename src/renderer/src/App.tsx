import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { TitleBar } from './components/titlebar/TitleBar'
import { LibraryTab } from './components/library/LibraryTab'
import { DataTab } from './components/datatab/DataTab'
import { ProfileStatsTab } from './components/datatab/ProfileStatsTab'
import { AboutTab } from './components/about/AboutTab'
import { ModifyDialog } from './components/dialogs/ModifyDialog'
import { NotesDialog } from './components/dialogs/NotesDialog'
import { ScreenshotsDialog } from './components/dialogs/ScreenshotsDialog'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { GameInfoDialog } from './components/dialogs/GameInfoDialog'
import { AddGameDialog } from './components/dialogs/AddGameDialog'
import { FirstRunPrompts } from './components/dialogs/FirstRunPrompts'
import { InstalledGamesDialog } from './components/dialogs/InstalledGamesDialog'
import { AdjustTimeDialog } from './components/dialogs/AdjustTimeDialog'
import { SubCategoryPromptDialog } from './components/dialogs/SubCategoryPromptDialog'
import { CompleteTimerDialog } from './components/dialogs/CompleteTimerDialog'
import { ProfileStatsPerGameDialog } from './components/dialogs/ProfileStatsPerGameDialog'
import { ActiveTimersDialog } from './components/dialogs/ActiveTimersDialog'
import { PlayHistoryDialog } from './components/dialogs/PlayHistoryDialog'
import { UpdatePrompt } from './components/dialogs/UpdatePrompt'
import { ToastHost } from './components/common/Toast'
import { useProfilesStore, startProfilesChangeSubscription } from './state/profilesStore'
import { loadSettings } from './state/settingsStore'
import { startTimerTickSubscription } from './state/timerStore'
import { startOpenGamesSubscription } from './state/openGamesStore'
import { startNotesPopoutSync } from './state/notesPopoutSync'
import { startToastBroadcastSync } from './state/toastBroadcastSync'
import { useUiStore } from './state/uiStore'

// The Timer tab is gone. It existed to answer "what am I playing", but a game's
// Library detail page already shows its clock, its Play/Pause and its Launch —
// so the tab was a second route to one job, and the app is smaller without it.
//
// K1: Stats split into two — Game Stats (per game, this tab's original job)
// and Profile Stats (account-wide: active/idle time, hours by genre). "Your
// stats" stopped meaning one thing once there were two answers to it.
const TAB_KEYS = {
  library: 'tab_library',
  stats: 'tab_stats',
  profileStats: 'tab_profile_stats',
  about: 'tab_about'
} as const

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
    startOpenGamesSubscription()
    startProfilesChangeSubscription()
    startNotesPopoutSync()
    startToastBroadcastSync()
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
      {activeTab === 'library' && <LibraryTab />}
      {activeTab === 'stats' && <DataTab />}
      {activeTab === 'profileStats' && <ProfileStatsTab />}
      {activeTab === 'about' && <AboutTab />}

      {dialog === 'modify' && dialogTarget && (
        <ModifyDialog name={dialogTarget} onClose={closeDialog} />
      )}
      {dialog === 'notes' && dialogTarget && <NotesDialog name={dialogTarget} onClose={closeDialog} />}
      {dialog === 'screenshots' && dialogTarget && (
        <ScreenshotsDialog name={dialogTarget} onClose={closeDialog} />
      )}
      {dialog === 'settings' && <SettingsDialog onClose={closeDialog} />}
      {dialog === 'info' && dialogTarget && <GameInfoDialog name={dialogTarget} onClose={closeDialog} />}
      {dialog === 'add' && <AddGameDialog onClose={closeDialog} />}

      {dialog === 'time' && dialogTarget && <AdjustTimeDialog name={dialogTarget} onClose={closeDialog} />}
      {dialog === 'subCategoryPrompt' && dialogTarget && (
        <SubCategoryPromptDialog name={dialogTarget} onClose={closeDialog} />
      )}
      {dialog === 'completeTimerPicker' && dialogTarget && (
        <CompleteTimerDialog name={dialogTarget} onClose={closeDialog} />
      )}
      {dialog === 'profileStatsPerGame' && dialogTarget && (
        <ProfileStatsPerGameDialog name={dialogTarget} onClose={closeDialog} />
      )}
      {dialog === 'installed' && <InstalledGamesDialog onClose={closeDialog} />}
      {dialog === 'activeTimers' && <ActiveTimersDialog onClose={closeDialog} />}
      {dialog === 'playHistory' && dialogTarget && <PlayHistoryDialog name={dialogTarget} onClose={closeDialog} />}

      <FirstRunPrompts />
      <UpdatePrompt />
      <ToastHost />
    </div>
  )
}

export default App
