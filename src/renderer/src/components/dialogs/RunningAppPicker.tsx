import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DetectedApp } from '@shared/types'

/**
 * The grid of currently-running applications. Shared by Add Game (creating a
 * new game from what's running) and Modify (linking an .exe to a game that was
 * added by hand), so the two can't drift apart.
 */
export function RunningAppPicker({
  busy,
  onPick
}: {
  busy: boolean
  onPick: (app: DetectedApp) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [apps, setApps] = useState<DetectedApp[] | null>(null)

  useEffect(() => {
    void (async () => {
      const found = await window.api.detect.listRunning()
      setApps(found)
      // Second pass: ask Steam's catalogue about the ones the path heuristic
      // could not place, and promote any it confirms. Deliberately after the
      // list is on screen — the picker must be usable instantly, and this is a
      // network round trip per app. Promotion only: a "no", or being offline,
      // leaves everything exactly where it already was.
      const unsure = found.filter((a) => !a.likelyGame).map((a) => a.exePath)
      if (unsure.length === 0) return
      const confirmed = new Set(await window.api.detect.classify(unsure))
      if (confirmed.size === 0) return
      setApps((current) =>
        (current ?? found).map((a) => (confirmed.has(a.exePath) ? { ...a, likelyGame: true } : a))
      )
    })()
  }, [])

  if (apps === null) {
    return <div className="py-8 text-center text-sm text-subtext">{t('add_scanning')}</div>
  }
  if (apps.length === 0) {
    return <div className="py-8 text-center text-sm text-subtext">{t('add_no_apps')}</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
       * Two labelled groups rather than one undifferentiated grid: Gamut can
       * tell a game-library install from an ordinary program, and an unlabelled
       * list of Adrenalin / Discord reads as though it thinks those ARE games.
       * The other apps still appear, because plenty of games install outside
       * the standard folders.
       */}
      {(
        [
          ['games', apps.filter((a) => a.likelyGame)],
          ['other', apps.filter((a) => !a.likelyGame)]
        ] as const
      ).map(([group, list]) =>
        list.length === 0 ? null : (
          <div key={group}>
            <div className="mb-1.5 text-xs font-medium text-subtext">
              {group === 'games' ? t('add_group_games') : t('add_group_other')}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {list.map((a) => (
                <button
                  key={a.pid}
                  disabled={busy}
                  onClick={() => onPick(a)}
                  className={`flex flex-col items-center gap-2 rounded-lg p-3 text-center transition-colors disabled:opacity-50 ${
                    a.likelyGame ? 'bg-card hover:bg-card/70' : 'bg-card/40 hover:bg-card/60'
                  }`}
                >
                  {a.iconDataUrl ? (
                    <img src={a.iconDataUrl} className="h-10 w-10 rounded object-contain" alt="" />
                  ) : (
                    <span className="h-10 w-10 rounded bg-panel" />
                  )}
                  <span className="w-full truncate text-xs text-text" title={a.title}>
                    {a.title}
                  </span>
                  <span className="w-full truncate text-[0.65rem] text-subtext">{a.processName}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}
      {apps.every((a) => !a.likelyGame) && (
        <div className="rounded bg-card/40 px-3 py-2 text-xs text-subtext">{t('add_no_games_hint')}</div>
      )}
    </div>
  )
}
