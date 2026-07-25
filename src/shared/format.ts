/**
 * Mirrors v1's format_seconds() exactly (HH:MM:SS, or "Nd HH:MM:SS" once a
 * game crosses 24h) — shared because both the status-log writer (main) and
 * the timer display (renderer) need the identical format.
 */
export function formatSeconds(totalSeconds: number): string {
  const total = Math.floor(totalSeconds)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  if (days) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
