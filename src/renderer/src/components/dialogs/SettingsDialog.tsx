import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { EyedropperButton } from '../common/EyedropperButton'
import { useSettingsStore, updateSettings, updateSettingsOptimistic } from '../../state/settingsStore'
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
import type { ThemeColors, ThemeName } from '@shared/types'

type Tab = 'general' | 'appearance' | 'ui' | 'language'

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
    { id: 'appearance', label: t('tab_appearance') },
    { id: 'ui', label: t('tab_ui') },
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
            label="Keep Game Timer updated"
            checked={settings.checkForUpdates}
            onChange={(v) => void updateSettings({ checkForUpdates: v })}
          />
        </div>
      )}

      {tab === 'appearance' && <AppearanceTab settings={settings} />}

      {tab === 'ui' && (
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
            <select
              value={settings.fontFamily}
              onChange={(e) => void updateSettings({ fontFamily: e.target.value })}
              className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
            >
              {FONT_CHOICES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
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
