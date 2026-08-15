import { create } from 'zustand'
import { useProfilesStore } from './profilesStore'
import { useSettingsStore } from './settingsStore'
import { useUiStore } from './uiStore'
import type { TimerTickPayload } from '@shared/ipcContract'

interface TimerState {
  /** name -> live total seconds, pushed every 500ms by main. A name's presence here means it's running. */
  running: Record<string, number>
  /** name -> the assigned category's own live total, same cadence as `running` — see TimerTickPayload. */
  runningCategories: TimerTickPayload['runningCategories']
}

export const useTimerStore = create<TimerState>(() => ({ running: {}, runningCategories: {} }))

let unsubscribe: (() => void) | null = null

/**
 * True once the first tick has been processed. Guards against treating
 * whatever is ALREADY running at subscribe-time (e.g. the renderer reloaded
 * while a game was mid-session) as "just started" — only a name that
 * genuinely wasn't in the previous tick counts.
 */
let hasBaseline = false
let previousRunning = new Set<string>()

function shouldPromptFor(name: string): boolean {
  const profile = useProfilesStore.getState().profiles[name]
  if (!profile || profile.subCategories.length === 0) return false
  const globalDefault = useSettingsStore.getState().settings?.subCategoriesEnabled ?? true
  return profile.subCategoriesEnabled ?? globalDefault
}

export function startTimerTickSubscription(): void {
  if (unsubscribe) return
  unsubscribe = window.api.timer.onTick((payload) => {
    useTimerStore.setState({ running: payload.running, runningCategories: payload.runningCategories })

    const nowRunning = new Set(Object.keys(payload.running))
    if (hasBaseline) {
      for (const name of nowRunning) {
        if (!previousRunning.has(name) && shouldPromptFor(name)) {
          // Don't steal focus from something the user already has open —
          // see the design spec's dialog-stacking note. The session still
          // defaults to Main (no prompt = no assignSubCategorySession call),
          // same as closing the prompt without answering.
          if (useUiStore.getState().dialog === null) {
            useUiStore.getState().openDialog('subCategoryPrompt', name)
          }
        }
      }
    }
    previousRunning = nowRunning
    hasBaseline = true
  })
}
