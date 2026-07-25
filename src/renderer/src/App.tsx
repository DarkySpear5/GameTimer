import { useEffect } from 'react'
import { TitleBar } from './components/titlebar/TitleBar'
import { GameList } from './components/gamelist/GameList'
import { SelectedGameView } from './components/timerview/SelectedGameView'
import { DataTab } from './components/datatab/DataTab'
import { AboutTab } from './components/about/AboutTab'
import { useProfilesStore } from './state/profilesStore'
import { loadSettings } from './state/settingsStore'
import { startTimerTickSubscription } from './state/timerStore'
import { useUiStore } from './state/uiStore'

const TAB_LABELS = { timer: 'Game Timer', data: 'Data', about: 'About' } as const

function App(): React.JSX.Element {
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)

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
      <div className="flex gap-1 border-b border-card/60 px-3 pt-2">
        {(Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-card text-accent' : 'text-subtext hover:text-text'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      {activeTab === 'timer' && (
        <div className="flex flex-1 overflow-hidden">
          <GameList />
          <SelectedGameView />
        </div>
      )}
      {activeTab === 'data' && <DataTab />}
      {activeTab === 'about' && <AboutTab />}
    </div>
  )
}

export default App
