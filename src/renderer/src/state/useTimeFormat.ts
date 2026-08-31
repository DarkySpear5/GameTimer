import type { TimeFormat } from '@shared/types'
import { useSettingsStore } from './settingsStore'

/** Reads the persisted duration-display preference with a safe first-render default. */
export function useTimeFormat(): TimeFormat {
  return useSettingsStore((s) => s.settings?.timeFormat ?? 'clock')
}
