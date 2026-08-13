/**
 * J4: a small spinner for any operation slow enough to be mistaken for a
 * freeze — a registry/filesystem scan, a network round trip to Steam. Plain
 * "Searching…" text and a disabled button gave no sign that anything was
 * actually happening; this is the one shared visual for "working on it".
 *
 * Pure CSS animation (no extra dependency), sized via `className` so it drops
 * into a button's label or a full-page placeholder alike.
 */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={`animate-spin text-current opacity-70 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
      <path
        className="opacity-90"
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
