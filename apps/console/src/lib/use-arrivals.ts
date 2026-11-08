import { useEffect, useMemo, useRef } from 'react'

/**
 * Returns the keys that appeared since the previous render, ignoring everything
 * present when data first became ready. Use it so only genuinely new items animate:
 * paging, filtering or switching views re-mounts old rows without animating them.
 * Key on `${id}:${state}` to catch state changes as well as new items.
 */
export function useArrivals(keys: string[], ready = true): Set<string> {
  const seen = useRef<Set<string> | null>(null)

  const fresh = useMemo(() => {
    if (!ready || !seen.current) return new Set<string>()
    return new Set(keys.filter(k => !seen.current!.has(k)))
  }, [keys, ready])

  useEffect(() => {
    if (!ready) return
    const s = seen.current ?? new Set<string>()
    for (const k of keys) s.add(k)
    seen.current = s
  }, [keys, ready])

  return fresh
}

/** True when the user asked the OS for reduced motion. Read once per call. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
