import { useEffect, useRef, useState } from 'react'

// Keeps the last live value of a view in localStorage so a reload paints instantly
// from cache while SpacetimeDB reconnects. Only plain JSON goes in (no bigint or
// Timestamp objects), and every storage call is wrapped: storage can be blocked.

interface Stored<T> {
  savedAt: number
  data: T
}

function read<T>(key: string): Stored<T> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Stored<T>) : null
  } catch {
    return null
  }
}

/**
 * Returns live data once `ready`, otherwise the cached copy (if any).
 * Saves the live value at most every `throttleMs`.
 */
export function useSnapshot<T>(key: string, live: T, ready: boolean, throttleMs = 2000) {
  const [cache] = useState(() => read<T>(key))
  const lastSave = useRef(0)
  const pending = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!ready) return
    const save = () => {
      lastSave.current = Date.now()
      try {
        localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data: live } satisfies Stored<T>))
      } catch {
        // Storage full or blocked: the view still works, it just will not paint from cache.
      }
    }
    const wait = throttleMs - (Date.now() - lastSave.current)
    window.clearTimeout(pending.current)
    if (wait <= 0) save()
    else pending.current = window.setTimeout(save, wait)
    return () => window.clearTimeout(pending.current)
  }, [key, live, ready, throttleMs])

  if (ready) return { data: live, cached: false as const, savedAt: undefined }
  if (cache) return { data: cache.data, cached: true as const, savedAt: cache.savedAt }
  return { data: undefined, cached: false as const, savedAt: undefined }
}

/** Re-renders every `everyMs` so "x seconds ago" labels keep moving. */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}

export function ago(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ${m % 60}m ago`
}
