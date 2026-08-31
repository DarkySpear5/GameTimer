import type { TimeFormat } from './types'

/** Shared duration formatter for the main app, overlay, and status log. */
export function formatSeconds(totalSeconds: number, format: TimeFormat = 'clock'): string {
  const total = Math.floor(totalSeconds)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')

  if (format === 'units') {
    const parts = [
      days > 0 ? `${days}d` : null,
      hours > 0 || days > 0 ? `${hours}h` : null,
      minutes > 0 || hours > 0 || days > 0 ? `${minutes}m` : null,
      `${seconds}s`
    ]
    return parts.filter((part): part is string => part !== null).join(' ')
  }

  return `${pad(Math.floor(total / 3600))}:${pad(minutes)}:${pad(seconds)}`
}
