import { create } from 'zustand'
import i18n from '../i18n/i18n'
import type { Settings } from '@shared/types'
import { THEMES } from '@shared/constants'

interface SettingsState {
  settings: Settings | null
  setSettings: (settings: Settings) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings })
}))

export async function loadSettings(): Promise<void> {
  const settings = await window.api.settings.get()
  useSettingsStore.getState().setSettings(settings)
  applyThemeToDocument(settings)
  void i18n.changeLanguage(settings.language)
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const settings = await window.api.settings.update(patch)
  useSettingsStore.getState().setSettings(settings)
  applyThemeToDocument(settings)
  if (patch.language) void i18n.changeLanguage(patch.language)
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * For continuous drag controls (font-scale slider, custom-color swatches) —
 * these fire an onChange on every pixel of movement, and calling
 * updateSettings() on each one both feels laggy (waiting on an IPC
 * round-trip per tick) and hammers disk with a save per tick. This applies
 * the patch to local state immediately so the control feels instant, then
 * only commits to main (and disk) once movement pauses for `debounceMs`.
 */
export function updateSettingsOptimistic(patch: Partial<Settings>, debounceMs = 250): void {
  const current = useSettingsStore.getState().settings
  if (!current) return
  const optimistic = { ...current, ...patch }
  useSettingsStore.getState().setSettings(optimistic)
  applyThemeToDocument(optimistic)

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void updateSettings(patch)
  }, debounceMs)
}

/** Pushes the active theme's colors onto :root as CSS custom properties — see styles/tailwind.css's gradient formula. */
export function applyThemeToDocument(settings: Settings): void {
  const colors = settings.theme === 'Custom' ? settings.customColors : THEMES[settings.theme]
  const root = document.documentElement.style
  root.setProperty('--gt-bg', colors.bg)
  root.setProperty('--gt-panel', colors.panel)
  root.setProperty('--gt-card', colors.card)
  root.setProperty('--gt-text', colors.text)
  root.setProperty('--gt-subtext', colors.subtext)
  root.setProperty('--gt-accent', colors.accent)
  document.documentElement.setAttribute('data-theme', settings.theme)
  document.documentElement.style.setProperty('--gt-font-scale', String(settings.fontScale))
  // Actually apply the scale: Tailwind's text-*/spacing utilities are rem-based
  // (relative to the root <html> font-size), so scaling that one value scales
  // all of them proportionally — previously this was only ever stored, never
  // consumed anywhere, so the slider had no visible effect.
  document.documentElement.style.fontSize = `${16 * settings.fontScale}px`
  document.body.style.fontFamily = `"${settings.fontFamily}", "Segoe UI", -apple-system, sans-serif`
}
