import { dataStore } from './dataStore'
import type { Settings } from '@shared/types'
import { setRunAtStartup } from '../autostart/autostart'
import { syncTrayEnabled } from '../appLifecycle'

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = dataStore.get().settings
  Object.assign(settings, patch)
  if (patch.runAtStartup !== undefined) setRunAtStartup(patch.runAtStartup)
  if (patch.trayEnabled !== undefined) syncTrayEnabled(patch.trayEnabled)
  await dataStore.safeSave()
  return settings
}
