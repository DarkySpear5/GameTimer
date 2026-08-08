import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { EyedropperButton } from '../common/EyedropperButton'
import { useSettingsStore, updateSettings, updateSettingsOptimistic } from '../../state/settingsStore'
import { useUiStore } from '../../state/uiStore'
import {
  THEMES,
  THEME_ORDER,
  FONT_CHOICES,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  ICON_SIZE_OPTIONS,
  LANGUAGE_ORDER,
  LANGUAGE_NAMES
} from '@shared/constants'
import type { Settings, ThemeColors, ThemeName } from '@shared/types'

type Tab = 'general' | 'games' | 'appearance' | 'language'

const ROLE_KEYS: Record<keyof ThemeColors, string> = {
  bg: 'role_background',
  panel: 'role_panel',
  card: 'role_cards',
  text: 'role_text',
  subtext: 'role_subtext',
  accent: 'role_accent'
}

export function SettingsDialog({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const { t } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  const [tab, setTab] = useState<Tab>('general')

  if (!settings) return null

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: t('tab_general') },
    // Everything about detecting and decorating games in one place — these
    // were scattered across General before and read as unrelated switches.
    { id: 'games', label: t('tab_games') },
    { id: 'appearance', label: t('tab_appearance') },
    { id: 'language', label: t('tab_language') }
  ]

  return (
    <Modal title={t('settings_title')} onClose={onClose} width="max-w-lg">
      <div className="mb-4 flex gap-1 border-b border-card">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tab === tb.id ? 'border-b-2 border-accent text-accent' : 'text-subtext hover:text-text'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="flex flex-col gap-3">
          <ToggleRow
            label={t('chk_launch_at_startup')}
            checked={settings.runAtStartup}
            onChange={(v) => void updateSettings({ runAtStartup: v })}
          />
          <ToggleRow
            label={t('chk_enable_tray')}
            checked={settings.trayEnabled}
            onChange={(v) => void updateSettings({ trayEnabled: v })}
          />
          <ToggleRow
            label="Keep Gamut updated"
            checked={settings.checkForUpdates}
            onChange={(v) => void updateSettings({ checkForUpdates: v })}
          />
        </div>
      )}

      {tab === 'games' && (
        <div className="flex flex-col gap-3">
          {/*
           * The default for every game that hasn't set its own preference —
           * turning this off stops art being fetched for games added from now
           * on, and for any game still following the global setting.
           */}
          <ToggleRow
            label={t('label_auto_art')}
            checked={settings.autoFetchArt}
            onChange={(v) => void updateSettings({ autoFetchArt: v })}
          />
          <ToggleRow
            label={t('label_watch_games')}
            checked={settings.watchForGames}
            onChange={(v) => void updateSettings({ watchForGames: v })}
          />
          {/*
           * Off by default and that is a product decision, not caution:
           * auto-tracking measures "the process was open", which is how Steam
           * turns a 19-hour playthrough into 50.
           */}
          <ToggleRow
            label={t('label_auto_start')}
            checked={settings.autoStartTimer}
            onChange={(v) => void updateSettings({ autoStartTimer: v })}
          />

          {/*
           * One switch for both the Stats table and the More info window. Two
           * separate toggles would make "show me more" something you have to
           * find twice, and nobody thinks of those two screens as unrelated.
           *
           * Lives under Games rather than Appearance because it decides WHAT
           * information about your games is shown, not how the app looks —
           * Appearance keeps theme, font and sizes.
           */}
          <div className="mt-2 border-t border-card/60 pt-4">
            <label className="mb-1 block text-xs text-subtext">{t('label_detail_level')}</label>
            <div className="flex overflow-hidden rounded bg-card">
              {(['simple', 'advanced'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => void updateSettings({ detailLevel: level })}
                  className={`flex-1 px-3 py-1.5 text-sm transition-colors ${
                    settings.detailLevel === level ? 'bg-accent text-bg' : 'text-subtext hover:text-text'
                  }`}
                >
                  {t(level === 'simple' ? 'detail_simple' : 'detail_advanced')}
                </button>
              ))}
            </div>
            <div className="mt-1 text-xs text-subtext">{t('label_detail_level_hint')}</div>
          </div>

          {/*
           * The permanent home of the first-run offer. Its existence is what
           * makes that one-time prompt safe to decline — "not now" costs
           * nothing when the door stays open.
           */}
          <div className="mt-2 flex flex-col gap-1.5 border-t border-card/60 pt-4">
            <button
              onClick={() => useUiStore.getState().openDialog('installed')}
              className="self-start rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
            >
              {t('installed_scan_button')}
            </button>
            <span className="text-xs text-subtext">{t('installed_scan_hint')}</span>
          </div>
        </div>
      )}

      {tab === 'appearance' && (
        <div className="flex flex-col gap-6">
          <AppearanceTab settings={settings} />
          {/* The old separate "UI" tab — same controls, one level down, since
              theme and text size are the same question to a user. */}
          <div className="border-t border-card pt-5">
            <div className="mb-3 text-xs font-medium tracking-wide text-subtext">{t('tab_ui')}</div>
            <UiTab settings={settings} />
          </div>
        </div>
      )}

      {tab === 'language' && (
        <div className="grid grid-cols-2 gap-1.5">
          {LANGUAGE_ORDER.map((code) => (
            <button
              key={code}
              onClick={() => void updateSettings({ language: code })}
              className={`rounded px-3 py-1.5 text-left text-sm ${
                settings.language === code ? 'bg-accent text-bg' : 'bg-card text-text hover:bg-card/70'
              }`}
            >
              {LANGUAGE_NAMES[code]}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

/**
 * One combined font list, not two separate pickers: FONT_CHOICES (curated)
 * plus every font actually installed on this PC — fetched once from main
 * (font-list, via fonts.list IPC) and merged there, so this component just
 * filters/renders whatever comes back. Falls back to the curated list alone
 * if the IPC call hasn't resolved yet.
 */
function UiTab({
  settings
}: {
  settings: Pick<Settings, 'fontFamily' | 'fontScale' | 'iconSize' | 'dataTableScale'>
}): React.JSX.Element {
  const { t } = useTranslation()
  const [allFonts, setAllFonts] = useState<string[]>(FONT_CHOICES)
  const [query, setQuery] = useState('')

  useEffect(() => {
    void window.api.fonts.list().then(setAllFonts)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allFonts
    return allFonts.filter((f) => f.toLowerCase().includes(q))
  }, [allFonts, query])

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-1 block text-xs text-subtext">
          {t('label_font_size')} — {settings.fontScale.toFixed(1)}x
        </label>
        <input
          type="range"
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={0.1}
          value={settings.fontScale}
          onChange={(e) => updateSettingsOptimistic({ fontScale: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_font')}</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('placeholder_search_fonts')}
          className="mb-1.5 w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none ring-1 ring-transparent focus:ring-accent"
        />
        <div className="max-h-40 overflow-y-auto rounded bg-card">
          {filtered.map((f) => (
            <button
              key={f}
              onClick={() => void updateSettings({ fontFamily: f })}
              style={{ fontFamily: `"${f}"` }}
              className={`block w-full px-2.5 py-1.5 text-left text-sm ${
                settings.fontFamily === f ? 'bg-accent text-bg' : 'text-text hover:bg-panel'
              }`}
            >
              {f}
            </button>
          ))}
          {filtered.length === 0 && <div className="px-2.5 py-2 text-xs text-subtext">—</div>}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_table_size')}</label>
        <select
          value={settings.dataTableScale}
          onChange={(e) => void updateSettings({ dataTableScale: parseFloat(e.target.value) })}
          className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
        >
          <option value={1}>{t('size_small')}</option>
          <option value={1.15}>{t('size_medium')}</option>
          <option value={1.35}>{t('size_large')}</option>
          <option value={1.6}>{t('size_xl')}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_icon_size')}</label>
        <select
          value={settings.iconSize}
          onChange={(e) => void updateSettings({ iconSize: parseInt(e.target.value, 10) })}
          className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
        >
          {Object.entries(ICON_SIZE_OPTIONS).map(([label, value]) => (
            <option key={label} value={value}>
              {t(sizeKeyFor(label))}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function sizeKeyFor(label: string): string {
  switch (label) {
    case 'Small':
      return 'size_small'
    case 'Medium':
      return 'size_medium'
    case 'Large':
      return 'size_large'
    default:
      return 'size_xl'
  }
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex items-center justify-between rounded bg-card px-3 py-2.5 text-sm text-text">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--gt-accent)]"
      />
    </label>
  )
}

function AppearanceTab({ settings }: { settings: { theme: ThemeName; customColors: ThemeColors } }): React.JSX.Element {
  const { t } = useTranslation()
  const isCustom = settings.theme === 'Custom'

  function setColor(role: keyof ThemeColors, value: string): void {
    updateSettingsOptimistic({
      theme: 'Custom',
      customColors: { ...settings.customColors, [role]: value }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {THEME_ORDER.map((themeName) => {
          const preview = themeName === 'Custom' ? settings.customColors : THEMES[themeName]
          return (
            <button
              key={themeName}
              onClick={() => void updateSettings({ theme: themeName })}
              className={`flex items-center gap-2 rounded px-3 py-2 text-left text-sm ${
                settings.theme === themeName ? 'ring-1 ring-accent' : ''
              } bg-card text-text`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-black/20"
                style={{ background: preview.bg }}
              />
              {themeName}
            </button>
          )
        })}
      </div>

      {isCustom && (
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(settings.customColors) as (keyof ThemeColors)[]).map((role) => (
            <div key={role} className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={settings.customColors[role]}
                  onChange={(e) => setColor(role, e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded bg-card"
                />
                <EyedropperButton onPick={(hex) => setColor(role, hex)} />
              </div>
              <span className="text-xs text-subtext">{t(ROLE_KEYS[role])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
