import i18n from '../i18n/i18n'
import { toast } from '../components/common/Toast'

const KEY_BY_CODE: Record<string, string> = {
  screenshot_saved: 'toast_screenshot_saved',
  screenshot_fallback: 'toast_screenshot_fallback',
  screenshot_failed: 'err_screenshot_failed'
}

/** Toasts triggered from main (e.g. the global screenshot hotkey) arrive as a code + params, translated here since main has no i18n instance — see the IPC contract's ToastBroadcastPayload doc. */
export function startToastBroadcastSync(): () => void {
  return window.api.toast.onBroadcast(({ code, kind, params }) => {
    const message = i18n.t(KEY_BY_CODE[code] ?? code, params)
    if (kind === 'error') toast.error(message)
    else toast.info(message)
  })
}
