import { useTranslation } from 'react-i18next'
import { useSettingsStore, updateSettings, updateSettingsOptimistic } from '../../state/settingsStore'
import { ToggleRow } from './SettingsDialog'
import { OVERLAY_SCALE_MIN, OVERLAY_SCALE_MAX } from '@shared/constants'
import type { OverlayCorner } from '@shared/types'

const CORNERS: OverlayCorner[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
]

export function OverlaySettings(): React.JSX.Element | null {
  const { t } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  if (!settings) return null
  const overlay = settings.overlay

  return (
    <div className="flex flex-col gap-4">
      <ToggleRow
        label={t('label_overlay_enabled')}
        checked={overlay.enabled}
        onChange={(v) => void updateSettings({ overlay: { ...overlay, enabled: v } })}
      />

      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_overlay_position')}</label>
        <div className="grid grid-cols-3 gap-1.5">
          {CORNERS.map((corner) => (
            <button
              key={corner}
              onClick={() => void updateSettings({ overlay: { ...overlay, corner } })}
              className={`rounded px-2 py-1.5 text-xs ${
                overlay.corner === corner ? 'bg-accent text-bg' : 'bg-card text-text hover:bg-card/70'
              }`}
            >
              {t(`overlay_corner_${corner.replace(/-/g, '_')}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-subtext">
          {t('label_overlay_size')} — {overlay.scale.toFixed(1)}x
        </label>
        <input
          type="range"
          min={OVERLAY_SCALE_MIN}
          max={OVERLAY_SCALE_MAX}
          step={0.1}
          value={overlay.scale}
          onChange={(e) => updateSettingsOptimistic({ overlay: { ...overlay, scale: parseFloat(e.target.value) } })}
          className="w-full"
        />
      </div>

      <ToggleRow
        label={t('label_overlay_shadow')}
        checked={overlay.shadow}
        onChange={(v) => void updateSettings({ overlay: { ...overlay, shadow: v } })}
      />
    </div>
  )
}
