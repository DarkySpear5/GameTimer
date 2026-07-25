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
  document.documentElement.style.setProperty('--gt-font-scale', String(settings.fontScale))
  document.body.style.fontFamily = `"${settings.fontFamily}", "Segoe UI", -apple-system, sans-serif`
}
