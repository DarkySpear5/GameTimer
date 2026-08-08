import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { toast } from '../common/Toast'
import { useProfilesStore } from '../../state/profilesStore'
import { selectProfile } from '../../state/uiStore'
import type { DetectedApp, GameIdentity, GameSearchHit } from '@shared/types'

type Mode = 'choose' | 'picker' | 'confirm' | 'manual'

/**
 * Two ways in, deliberately no third. "Browse for a .exe" was considered and
 * dropped — asking a non-technical user to locate a game's executable is the
 * confusing option, and the picker makes it unnecessary.
 */
export function AddGameDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('choose')
  const [apps, setApps] = useState<DetectedApp[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [manualName, setManualName] = useState('')

  // Set once a non-Steam game has been guessed at and needs confirming.
  const [pending, setPending] = useState<{ app: DetectedApp; identity: GameIdentity } | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GameSearchHit[] | null>(null)

  useEffect(() => {
    if (mode !== 'picker' || apps !== null) return
    void (async () => {
      const found = await window.api.detect.listRunning()
      setApps(found)
      // Second pass: ask Steam's catalogue about the ones the path heuristic
      // could not place, and promote any it confirms. Deliberately after the
      // list is already on screen — the picker must be usable instantly, and
      // this is a network round trip per app. Promotion only: a "no" (or being
      // offline) leaves everything exactly where it already was.
      const unsure = found.filter((a) => !a.likelyGame).map((a) => a.exePath)
      if (unsure.length === 0) return
      const confirmed = new Set(await window.api.detect.classify(unsure))
      if (confirmed.size === 0) return
      setApps((current) =>
        (current ?? found).map((a) => (confirmed.has(a.exePath) ? { ...a, likelyGame: true } : a))
      )
    })()
  }, [mode, apps])

  const finish = useCallback(
    async (name: string, exePath: string | null, appId: number | null): Promise<void> => {
      setBusy(true)
      try {
        const profile = await window.api.detect.createGame(name, exePath, appId)
        useProfilesStore.getState().upsert(profile)
        await selectProfile(profile.name)
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
        setBusy(false)
      }
    },
    [onClose]
  )

  async function handlePick(picked: DetectedApp): Promise<void> {
    setBusy(true)
    try {
      const identity = await window.api.detect.identify(picked.exePath, picked.title)
      // Steam-installed games came from a manifest and are exact, so they skip
      // the confirmation entirely. Everything else is a fuzzy search result and
      // gets shown first — that search returns wrong-but-plausible matches.
      if (identity.confident && identity.steamAppId != null) {
        await finish(identity.name, picked.exePath, identity.steamAppId)
        return
      }
      setPending({ app: picked, identity })
      setQuery(identity.name)
      setHits(identity.suggestions.length > 0 ? identity.suggestions : null)
      setMode('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runSearch(): Promise<void> {
    setBusy(true)
    try {
      setHits(await window.api.detect.search(query))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('add_title')} onClose={onClose} width={mode === 'picker' ? 'max-w-2xl' : 'max-w-md'}>
      {mode === 'choose' && (
        <div className="flex flex-col gap-2">
          <BigButton
            label={t('add_detect')}
            hint={t('add_detect_hint')}
            onClick={() => setMode('picker')}
            primary
          />
          <BigButton label={t('add_manual')} hint={t('add_manual_hint')} onClick={() => setMode('manual')} />
        </div>
      )}

      {mode === 'picker' && (
        <>
          {apps === null && <div className="py-8 text-center text-sm text-subtext">{t('add_scanning')}</div>}
          {apps !== null && apps.length === 0 && (
            <div className="py-8 text-center text-sm text-subtext">{t('add_no_apps')}</div>
          )}
          {/*
           * Split into two labelled groups rather than one undifferentiated
           * grid. Gamut can tell a game-library install from an ordinary
           * program, and an unlabelled list of Adrenalin / Discord / whatever
           * reads as though it thinks those ARE games. The other apps still
           * appear, because plenty of games install outside the standard
           * folders and the user has to be able to pick those too.
           */}
          {apps !== null && apps.length > 0 && (
            <div className="flex flex-col gap-4">
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
                        <AppTile key={a.pid} app={a} disabled={busy} onPick={() => void handlePick(a)} />
                      ))}
                    </div>
                  </div>
                )
              )}
              {apps.every((a) => !a.likelyGame) && (
                <div className="rounded bg-card/40 px-3 py-2 text-xs text-subtext">
                  {t('add_no_games_hint')}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === 'confirm' && pending && (
        <div className="flex flex-col gap-3">
          {/*
           * Shown rather than applied because the name search fails OPEN on
           * plausible input — "MarvelRivals" confidently resolves to Marvel
           * Rivals *Playtest*. One glance at the cover catches that.
           */}
          <div className="text-xs text-subtext">{t('add_found')}</div>
          <div className="flex items-center gap-3 rounded-lg bg-card p-3">
            {hits?.[0]?.appId != null && (
              <img
                src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${hits[0].appId}/library_600x900.jpg`}
                className="h-24 w-16 shrink-0 rounded object-cover"
                alt=""
              />
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text">{hits?.[0]?.name ?? query}</div>
              <div className="truncate text-xs text-subtext">{pending.app.exePath}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              placeholder={t('add_search_placeholder')}
              className="min-w-0 flex-1 rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none ring-1 ring-transparent focus:ring-accent"
            />
            <button
              onClick={() => void runSearch()}
              disabled={busy}
              className="shrink-0 rounded bg-card px-3 text-xs text-text hover:opacity-80 disabled:opacity-50"
            >
              {t('add_not_it')}
            </button>
          </div>

          {hits && hits.length > 1 && (
            <div className="max-h-40 overflow-y-auto rounded bg-card/50">
              {hits.map((h) => (
                <button
                  key={h.appId}
                  onClick={() => setHits([h, ...hits.filter((x) => x.appId !== h.appId)])}
                  className="block w-full truncate px-2.5 py-1.5 text-left text-xs text-text hover:bg-panel"
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}

          <button
            disabled={busy}
            onClick={() =>
              void finish(hits?.[0]?.name ?? query, pending.app.exePath, hits?.[0]?.appId ?? null)
            }
            className="rounded bg-accent py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {t('add_use_this')}
          </button>
        </div>
      )}

      {mode === 'manual' && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && manualName.trim() && void finish(manualName.trim(), null, null)}
            placeholder={t('dlg_add_game_prompt')}
            className="min-w-0 flex-1 rounded bg-card px-2.5 py-2 text-sm text-text outline-none ring-1 ring-accent"
          />
          <button
            disabled={busy || !manualName.trim()}
            onClick={() => void finish(manualName.trim(), null, null)}
            className="shrink-0 rounded bg-accent px-4 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {t('label_add')}
          </button>
        </div>
      )}
    </Modal>
  )
}

function AppTile({
  app,
  disabled,
  onPick
}: {
  app: DetectedApp
  disabled: boolean
  onPick: () => void
}): React.JSX.Element {
  return (
    <button
      disabled={disabled}
      onClick={onPick}
      className={`flex flex-col items-center gap-2 rounded-lg p-3 text-center transition-colors disabled:opacity-50 ${
        app.likelyGame ? 'bg-card hover:bg-card/70' : 'bg-card/40 hover:bg-card/60'
      }`}
    >
      {app.iconDataUrl ? (
        <img src={app.iconDataUrl} className="h-10 w-10 rounded object-contain" alt="" />
      ) : (
        <span className="h-10 w-10 rounded bg-panel" />
      )}
      <span className="w-full truncate text-xs text-text" title={app.title}>
        {app.title}
      </span>
      <span className="w-full truncate text-[0.65rem] text-subtext">{app.processName}</span>
    </button>
  )
}

function BigButton({
  label,
  hint,
  onClick,
  primary
}: {
  label: string
  hint: string
  onClick: () => void
  primary?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-3 text-left transition-colors ${
        primary ? 'bg-accent text-bg hover:opacity-90' : 'bg-card text-text hover:bg-card/70'
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className={`text-xs ${primary ? 'opacity-80' : 'text-subtext'}`}>{hint}</div>
    </button>
  )
}
