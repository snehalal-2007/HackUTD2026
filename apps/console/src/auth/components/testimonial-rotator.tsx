import { useEffect, useMemo, useState } from 'react'
import { PauseIcon, PlayIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { shuffled, TESTIMONIALS } from './testimonials'
import './auth.css'

const SHOW_MS = 9000 // time each quote stays up
const LEAVE_MS = 700 // fade-out before the next one slides in

/** Rotating customer quotes for the sign-in panel. Pausable, and still when reduced motion is on. */
export function TestimonialRotator() {
  const items = useMemo(() => shuffled(TESTIMONIALS), [])
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [index, setIndex] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [playing, setPlaying] = useState(!reduced)

  useEffect(() => {
    if (!playing) return
    const out = window.setTimeout(() => setLeaving(true), SHOW_MS - LEAVE_MS)
    const next = window.setTimeout(() => {
      setIndex(i => (i + 1) % items.length)
      setLeaving(false)
    }, SHOW_MS)
    return () => { window.clearTimeout(out); window.clearTimeout(next) }
  }, [playing, index, items.length])

  function goTo(i: number) {
    setLeaving(false)
    setIndex(i)
  }

  const t = items[index]

  return (
    <section aria-roledescription="carousel" aria-label="What operations teams say" className="flex flex-col gap-5">
      <div aria-live={playing ? 'off' : 'polite'} className={cn('flex h-[21rem] flex-col justify-end gap-5 [@media(max-height:820px)]:h-[17rem]', leaving && 'mesa-leave')}>
        <blockquote key={`q-${index}`} className="mesa-enter-left">
          <span aria-hidden="true" className="block font-serif text-6xl leading-none text-white/40 in-data-[tone=light]:text-neutral-950/25">“</span>
          <p className="-mt-4 max-w-xl text-xl leading-snug xl:text-2xl font-medium text-white [text-shadow:0_1px_12px_rgb(0_0_0/0.45)] in-data-[tone=light]:text-neutral-950 in-data-[tone=light]:[text-shadow:none]">
            {t.quote}
          </p>
        </blockquote>
        <p key={`a-${index}`} className="mesa-enter-left flex flex-col text-sm" style={{ animationDelay: '0.45s' }}>
          <span className="font-semibold text-white in-data-[tone=light]:text-neutral-950">{t.name}</span>
          <span className="text-white/70 in-data-[tone=light]:text-neutral-600">{t.role}, {t.company}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying(p => !p)}
          aria-label={playing ? 'Pause testimonials' : 'Play testimonials'}
          className="flex size-7 items-center justify-center rounded-full bg-white/10 text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 in-data-[tone=light]:bg-neutral-950/10 in-data-[tone=light]:text-neutral-950 in-data-[tone=light]:hover:bg-neutral-950/15 in-data-[tone=light]:focus-visible:ring-neutral-950/40"
        >
          {playing ? <PauseIcon className="size-3.5" aria-hidden="true" /> : <PlayIcon className="size-3.5" aria-hidden="true" />}
        </button>
        <div className="flex items-center gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.name}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show quote ${i + 1} of ${items.length}`}
              aria-current={i === index}
              className={cn(
                'h-1.5 rounded-full outline-none transition-all focus-visible:ring-2 focus-visible:ring-white/70 in-data-[tone=light]:focus-visible:ring-neutral-950/40',
                i === index ? 'w-6 bg-white in-data-[tone=light]:bg-neutral-950' : 'w-1.5 bg-white/40 hover:bg-white/70 in-data-[tone=light]:bg-neutral-950/25 in-data-[tone=light]:hover:bg-neutral-950/50',
              )}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
