import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const GITHUB_URL = 'https://github.com/DarkySpear5/GameTimer'

export function AboutTab(): React.JSX.Element {
  const { t } = useTranslation()
  const [version, setVersion] = useState('2.0.0')

  useEffect(() => {
    void window.api.app.getVersion().then(setVersion)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-text">
      <div className="mb-1 text-xl font-semibold">Game Timer</div>
      <div className="mb-5 text-subtext">
        v{version} — {t('about_tagline')}
      </div>
      <div className="mb-2 font-semibold">{t('about_built_with')}</div>
      <ul className="list-disc space-y-1 pl-5 text-subtext">
        <li>Electron</li>
        <li>React + TypeScript</li>
        <li>Tailwind CSS</li>
        <li>Zustand</li>
        <li>electron-vite / electron-builder</li>
      </ul>
      <div className="mt-5 mb-2 font-semibold">{t('about_contact_header')}</div>
      <div className="flex flex-col gap-1.5">
        <div>
          <span className="text-subtext">{t('about_contact_discord_label')}: </span>
          rawwwwwrr
        </div>
        <div>
          <span className="text-subtext">{t('about_contact_github_label')}: </span>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {GITHUB_URL}
          </a>
        </div>
      </div>
    </div>
  )
}
