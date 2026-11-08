import { useCallback, useEffect, useState } from 'react'

// History-based routing with real paths (no "#"): /, /auth/..., /intro/..., /console/<view>, /logs/:page.
// vercel.ts and the Vite dev server serve index.html for any unknown path, so every route loads the app.

/** Go to an in-app path without reloading; every usePath() hook hears about it. */
export function navigateTo(path: string, { replace = false }: { replace?: boolean } = {}) {
  if (path === window.location.pathname) return
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Old links used hash routes (/#/console/floor); turn them into real paths before the app reads the URL. */
export function upgradeHashUrl() {
  const h = window.location.hash
  if (h.startsWith('#/')) window.history.replaceState(null, '', h.slice(1).replace(/\/$/, '') || '/')
}

/** In-app links (<a href="/…">) navigate without a page reload; section links (#heat) and new tabs behave as usual. */
export function interceptLinks() {
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.('a')
    const href = a?.getAttribute('href')
    if (!a || !href || !href.startsWith('/') || href.startsWith('//') || a.target || a.hasAttribute('download')) return
    e.preventDefault()
    navigateTo(href)
  })
}

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = useCallback((next: string) => navigateTo(next), [])
  return { path, go }
}

/** "/logs" or "/logs/3" -> the page number (1-based); anything else -> null. */
export function logsPageFrom(path: string): number | null {
  const m = /^\/logs(?:\/(\d+))?\/?$/.exec(path)
  if (!m) return null
  return Math.max(1, Number(m[1] ?? '1') || 1)
}

export const logsPath = (page: number) => `/logs/${page}`
