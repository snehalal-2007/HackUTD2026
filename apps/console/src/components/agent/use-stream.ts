import { useEffect, useState } from 'react'

const PENDING_MS = 900
const STEP_MS = 24
const STEP_CHARS = 4

// Reveals `text` a few characters at a time after a short pending pause.
// Reduced motion gets the whole text at once rather than a faster crawl.
export function useStream(text: string, enabled: boolean) {
  const [revealed, setRevealed] = useState(enabled ? 0 : text.length)

  useEffect(() => {
    if (revealed >= text.length) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(text.length)
      return
    }
    const id = window.setTimeout(
      () => setRevealed(count => Math.min(count + STEP_CHARS, text.length)),
      revealed === 0 ? PENDING_MS : STEP_MS,
    )
    return () => window.clearTimeout(id)
  }, [revealed, text.length])

  return { revealed, done: revealed >= text.length, replay: () => setRevealed(0) }
}
