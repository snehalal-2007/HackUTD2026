import { useEffect, useRef } from 'react'
import { Walkthrough } from './walkthrough-scenes'

/**
 * Cycling walkthroughs (data hall → operations room → boardroom) under a dark-gray tint at 60%,
 * so white text on top stays readable. Shows one still frame when the viewer prefers reduced motion.
 */
export function WalkthroughBackdrop() {
  const host = useRef<HTMLDivElement>(null)
  const fade = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current || !fade.current) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w: Walkthrough | null = null
    try {
      w = new Walkthrough(host.current, fade.current, still)
    } catch {
      // No WebGL (old GPU, locked-down browser): the tint over the dark panel is enough.
    }
    return () => w?.dispose()
  }, [])

  return (
    <div ref={host} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0b0c0f]">
      <div ref={fade} className="absolute inset-0 bg-black" style={{ opacity: 1 }} />
      <div className="absolute inset-0 bg-[#1f2023]/60" />
    </div>
  )
}
