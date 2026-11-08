import { useCallback, useEffect, useState } from 'react'

// Minimal history-based routing. Only /logs/:page has a URL; every other view lives at "/".
// vercel.ts and the Vite dev server already serve index.html for unknown paths.

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = useCallback((next: string) => {
    if (next === window.location.pathname) return
    window.history.pushState(null, '', next)
    setPath(next)
  }, [])

  return { path, go }
}

/** "/logs" or "/logs/3" -> the page number (1-based); anything else -> null. */
export function logsPageFrom(path: string): number | null {
  const m = /^\/logs(?:\/(\d+))?\/?$/.exec(path)
  if (!m) return null
  return Math.max(1, Number(m[1] ?? '1') || 1)
}

export const logsPath = (page: number) => `/logs/${page}`
