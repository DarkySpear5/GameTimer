import { useEffect, useState } from 'react'

export function AboutTab(): React.JSX.Element {
  const [version, setVersion] = useState('2.0.0-beta.1')

  useEffect(() => {
    void window.api.app.getVersion().then(setVersion)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-text">
      <div className="mb-1 text-xl font-semibold">Game Timer</div>
      <div className="mb-5 text-subtext">v{version} — rebuilt on Electron, React, and TypeScript</div>
      <div className="mb-2 font-semibold">Built With</div>
      <ul className="list-disc space-y-1 pl-5 text-subtext">
        <li>Electron</li>
        <li>React + TypeScript</li>
        <li>Tailwind CSS</li>
        <li>Zustand</li>
        <li>electron-vite / electron-builder</li>
      </ul>
    </div>
  )
}
