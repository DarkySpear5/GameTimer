import type { GameTimerApi } from '@shared/ipcContract'

declare global {
  interface Window {
    api: GameTimerApi
  }
}
