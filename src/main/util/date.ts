/** Local-time "YYYY-MM-DD", matching v1's time.strftime("%Y-%m-%d"). */
export function todayDateString(): string {
  return dateString(new Date())
}

export function dateString(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Local-time "YYYY-MM-DD HH:MM:SS", matching v1's time.strftime("%Y-%m-%d %H:%M:%S"). */
export function timestampString(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${dateString(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
