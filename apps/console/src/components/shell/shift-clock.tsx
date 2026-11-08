import { useEffect, useState } from 'react'

const SHIFT_CHANGE = '06:00' // preview value; comes from the `shift` table once it exists

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now.toLocaleTimeString('en-GB', { hour12: false }) // "05:30:15"
}

/** Shift change time and a live clock for the top bar. */
export function ShiftClock() {
  const clock = useClock()
  return (
    <div className="flex items-baseline gap-4 text-xs text-muted-foreground">
      <span className="hidden sm:inline">
        Shift change <span className="font-mono">{SHIFT_CHANGE}</span>
      </span>
      <time className="font-mono text-sm font-semibold text-foreground tabular-nums">{clock}</time>
    </div>
  )
}
