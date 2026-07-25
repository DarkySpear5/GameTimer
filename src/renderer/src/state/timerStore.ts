import { create } from 'zustand'

interface TimerState {
  /** name -> live total seconds, pushed every 500ms by main. A name's presence here means it's running. */
  running: Record<string, number>
}

export const useTimerStore = create<TimerState>(() => ({ running: {} }))

let unsubscribe: (() => void) | null = null

export function startTimerTickSubscription(): void {
  if (unsubscribe) return
  unsubscribe = window.api.timer.onTick((payload) => {
    useTimerStore.setState({ running: payload.running })
  })
}
