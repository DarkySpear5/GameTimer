import { useEffect, useState } from 'react'
import { TitleBar } from './components/titlebar/TitleBar'

function App(): React.JSX.Element {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    void window.api.app.getVersion().then(setVersion)
  }, [])

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <TitleBar />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold text-text">Game Timer</div>
          <div className="mt-1 text-sm text-subtext">v{version || '2.0.0-beta.1'} — scaffold booting</div>
        </div>
      </div>
    </div>
  )
}

export default App
