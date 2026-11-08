import { useEffect, useRef } from 'react'
import { Walkthrough, type WalkTheme } from './walkthrough-scenes'

/**
 * Cycling walkthroughs (data hall → operations room → boardroom) under a dark-gray tint at 60%, or with tone="light"
 * just the data hall in light colours under a light tint,
 * so white text on top stays readable. Shows one still frame when the viewer prefers reduced motion.
 */
export function WalkthroughBackdrop({ tone = 'dark' }: { tone?: WalkTheme } = {}) {
  const host = useRef<HTMLDivElement>(null)
  const fade = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current || !fade.current) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w: Walkthrough | null = null
    try {
      w = new Walkthrough(host.current, fade.current, still, tone)
    } catch {
      // No WebGL (old GPU, locked-down browser): the tint over the dark panel is enough.
    }
    return () => w?.dispose()
  }, [tone])

  return (
    <div ref={host} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${tone === 'light' ? 'bg-[#ebe8e2]' : 'bg-[#0b0c0f]'}`}>
      <div ref={fade} className={`absolute inset-0 ${tone === 'light' ? 'bg-[#ebe8e2]' : 'bg-black'}`} style={{ opacity: 1 }} /> {/* scene changes fade through the page colour */}
      <div className={`absolute inset-0 ${tone === 'light' ? 'bg-[#ebe8e2]/50' : 'bg-[#1f2023]/60'}`} /> {/* tint: keeps the headline readable */}
    </div>
  )
}
