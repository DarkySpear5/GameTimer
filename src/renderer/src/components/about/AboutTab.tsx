import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_DISPLAY_NAME } from '@shared/channel'

const GITHUB_URL = 'https://github.com/DarkySpear5/Gamut'

// Each line is a separator plus one or more (label, url) pairs, so a line like
// "React + TypeScript" can link each half separately while keeping its own
// original punctuation ("+" here, "/" for the electron-vite line). Deliberately
// no link styling (color/underline) — the plain <a> below already inherits the
// list's text-subtext with no underline; only the GitHub link further down
// opts into looking like a link.
const BUILT_WITH: { sep: string; items: { label: string; url: string }[] }[] = [
  { sep: '', items: [{ label: 'Electron', url: 'https://www.electronjs.org/' }] },
  {
    sep: ' + ',
    items: [
      { label: 'React', url: 'https://react.dev/' },
      { label: 'TypeScript', url: 'https://www.typescriptlang.org/' }
    ]
  },
  { sep: '', items: [{ label: 'Tailwind CSS', url: 'https://tailwindcss.com/' }] },
  { sep: '', items: [{ label: 'Zustand', url: 'https://github.com/pmndrs/zustand' }] },
  {
    sep: ' / ',
    items: [
      { label: 'electron-vite', url: 'https://electron-vite.org/' },
      { label: 'electron-builder', url: 'https://www.electron.build/' }
    ]
  }
]

export function AboutTab(): React.JSX.Element {
  const { t } = useTranslation()
  const [version, setVersion] = useState('2.0.0')

  useEffect(() => {
    void window.api.app.getVersion().then(setVersion)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-text">
      <div className="mb-1 text-xl font-semibold">{APP_DISPLAY_NAME}</div>
      <div className="mb-5 text-subtext">
        v{version} — {t('about_tagline')}
      </div>
      <div className="mb-2 font-semibold">{t('about_built_with')}</div>
      <ul className="list-disc space-y-1 pl-5 text-subtext">
        {BUILT_WITH.map(({ sep, items }) => (
          <li key={items.map((item) => item.label).join(sep)}>
            {items.map((item, i) => (
              <span key={item.url}>
                {i > 0 && sep}
                <a href={item.url} target="_blank" rel="noreferrer" className="hover:text-text">
                  {item.label}
                </a>
              </span>
            ))}
          </li>
        ))}
      </ul>
      {/*
       * H1: where the cover art comes from. Worth stating plainly — these are
       * other people's storefronts and databases, and a tracker that quietly
       * pulls their images should say so.
       */}
      <div className="mt-5 mb-2 font-semibold">{t('about_art_header')}</div>
      <div className="text-subtext">{t('about_art_credits')}</div>

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
