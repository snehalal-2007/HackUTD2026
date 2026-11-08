import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon, MailIcon, XIcon } from 'lucide-react'
import { AUTH_ROUTES } from '@/auth/components/routes'
import { BrandMark } from '@/components/shell/brand-mark'
import { cn } from '@/lib/utils'
import { useScrolledPast } from './hooks'

/** Sample contact address. `.example` is reserved for documentation, so it can never reach a real inbox. */
export const CONTACT_EMAIL = 'contact@mesa.example'

type Tone = 'dark' | 'light'

/** "Contact" button with a small panel: the address, copy, and open-in-mail. */
export function ContactButton({ tone, className }: { tone: Tone; className?: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [open])

  async function copy() {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked: the address is on screen to select by hand.
    }
  }

  return (
    <div ref={box} className={cn('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2',
          tone === 'dark' ? 'text-white/85 hover:bg-white/10 hover:text-white focus-visible:ring-white/60' : 'text-neutral-700 hover:bg-black/5 hover:text-black focus-visible:ring-black/40',
        )}
      >
        <MailIcon className="size-4" aria-hidden="true" /> Contact
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Contact MESA"
          className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-black/10 bg-white p-4 text-left text-neutral-900 shadow-xl animate-in fade-in-0 slide-in-from-top-2"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">Talk to the MESA team</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-0.5 text-neutral-500 hover:text-black">
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Questions, demos or pricing. We reply within one business day.</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 font-mono text-sm">
            <span className="flex-1 truncate select-all">{CONTACT_EMAIL}</span>
            <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy email address'} className="text-neutral-500 hover:text-black">
              {copied ? <CheckIcon className="size-4 text-emerald-600" aria-hidden="true" /> : <CopyIcon className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('MESA enquiry')}`} className="mt-2 flex h-9 items-center justify-center rounded-lg bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-700">
            Open in your email app
          </a>
          <p className="mt-2 text-[0.65rem] text-neutral-400">Sample address for this preview.</p>
        </div>
      )}
    </div>
  )
}

/**
 * Top bar that slides down once the visitor has scrolled past the hero, with section links,
 * Contact and Sign in. Hidden (and out of the tab order) before that.
 */
export function SiteHeader({ tone, links }: { tone: Tone; links: { href: string; label: string }[] }) {
  const shown = useScrolledPast()
  return (
    <header
      inert={!shown}
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-all duration-500 ease-out motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
      )}
    >
      <div
        className={cn(
          'mx-auto mt-3 flex max-w-6xl items-center gap-4 rounded-full border px-3 py-2 shadow-lg backdrop-blur-xl sm:mx-4 lg:mx-auto',
          tone === 'dark' ? 'border-white/10 bg-neutral-950/70 text-white' : 'border-black/5 bg-white/80 text-neutral-900',
        )}
      >
        <a href="#top" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex items-center gap-2 pl-1">
          <BrandMark className={tone === 'dark' ? 'bg-white text-neutral-950' : 'bg-neutral-950 text-white'} />
          <span className="font-brand text-xl tracking-wide">mesa</span>
        </a>
        <nav aria-label="Sections" className="hidden flex-1 justify-center gap-1 md:flex">
          {links.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={e => { e.preventDefault(); document.querySelector(l.href)?.scrollIntoView({ behavior: 'smooth' }) }}
              className={cn('rounded-full px-3 py-1.5 text-sm', tone === 'dark' ? 'text-white/70 hover:text-white' : 'text-neutral-600 hover:text-black')}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <ContactButton tone={tone} />
          <a
            href={AUTH_ROUTES.quickSignIn}
            className={cn(
              'flex h-9 items-center rounded-full px-4 text-sm font-semibold',
              tone === 'dark' ? 'bg-white text-neutral-950 hover:bg-white/85' : 'bg-neutral-950 text-white hover:bg-neutral-800',
            )}
          >
            Sign in
          </a>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter({ tone }: { tone: Tone }) {
  return (
    <footer className={cn('border-t px-6 py-10 text-sm', tone === 'dark' ? 'border-white/10 text-white/50' : 'border-black/10 text-neutral-500')}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <span className="flex items-center gap-2"><span className="font-brand text-lg">mesa</span> · No alert left unowned</span>
        <span className="flex flex-wrap gap-4">
          <a href={AUTH_ROUTES.quickSignIn} className="hover:underline">Sign in</a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">{CONTACT_EMAIL}</a>
          <a href="#/intro" className="hover:underline">All intro samples</a>
        </span>
      </div>
    </footer>
  )
}
