import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../state/settingsStore'
import type { KeybindKind } from '@shared/ipcContract'

const ROWS: { kind: KeybindKind; labelKey: string }[] = [
  { kind: 'startPauseTimer', labelKey: 'label_keybind_start_pause' },
  { kind: 'saveScreenshot', labelKey: 'label_keybind_screenshot' },
  { kind: 'toggleOverlay', labelKey: 'label_keybind_toggle_overlay' }
]

/** Normalizes a KeyboardEvent into the token shape validateCombo expects (shared/validateCombo.ts). */
function normalizeKey(e: KeyboardEvent): string {
  if (e.key === 'Control') return 'Ctrl'
  if (e.key === ' ') return 'Space'
  if (e.key.length === 1) return e.key.toUpperCase()
  return e.key
}

/**
 * M: a "click to record" control per keybind. Listens for keydown/keyup
 * directly rather than a controlled <input> — a hotkey combo is inherently a
 * multi-key gesture, not text entry. Finalizes and sends the combo to main
 * (validate + register + persist, atomically — see keybindService.ts) the
 * moment any key is released, so holding Ctrl+2 and releasing 2 first (the
 * natural way to press a combo) is what ends capture.
 */
export function KeybindsSettings(): React.JSX.Element | null {
  const { t } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  const [capturing, setCapturing] = useState<KeybindKind | null>(null)
  const [errors, setErrors] = useState<Partial<Record<KeybindKind, 'invalid_combo' | 'register_failed'>>>({})

  if (!settings) return null

  function startCapture(kind: KeybindKind): void {
    setErrors((e) => ({ ...e, [kind]: undefined }))
    setCapturing(kind)
    const pressed: string[] = []

    function onKeyDown(e: KeyboardEvent): void {
      e.preventDefault()
      const key = normalizeKey(e)
      if (!pressed.includes(key)) pressed.push(key)
    }

    async function onKeyUp(e: KeyboardEvent): Promise<void> {
      e.preventDefault()
      if (pressed.length === 0) return
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      setCapturing(null)
      const combo = pressed.join('+')
      const result = await window.api.keybinds.set(kind, combo)
      if (result.ok) {
        useSettingsStore.getState().setSettings(result.settings)
      } else {
        setErrors((e2) => ({ ...e2, [kind]: result.error }))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  }

  return (
    <div className="flex flex-col gap-3">
      {ROWS.map(({ kind, labelKey }) => (
        <div key={kind} className="flex flex-col gap-1">
          <div className="flex items-center justify-between rounded bg-card px-3 py-2.5 text-sm text-text">
            <span>{t(labelKey)}</span>
            <button
              onClick={() => startCapture(kind)}
              className={`rounded px-3 py-1 font-mono text-xs ${
                capturing === kind ? 'bg-accent text-bg' : 'bg-panel text-text hover:bg-panel/70'
              }`}
            >
              {capturing === kind ? t('keybind_capture_listening') : settings.keybinds[kind]}
            </button>
          </div>
          {errors[kind] && (
            <span className="text-xs text-red">
              {t(errors[kind] === 'invalid_combo' ? 'err_keybind_invalid' : 'err_keybind_register_failed')}
            </span>
          )}
        </div>
      ))}
      <span className="text-xs text-subtext">{t('keybind_capture_hint')}</span>
    </div>
  )
}
