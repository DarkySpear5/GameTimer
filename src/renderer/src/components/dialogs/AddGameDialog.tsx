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
    void window.api.detect.listRunning().then(setApps)
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
          {apps !== null && apps.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {apps.map((a) => (
                <button
                  key={a.pid}
                  disabled={busy}
                  onClick={() => void handlePick(a)}
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
