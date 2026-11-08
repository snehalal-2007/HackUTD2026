import { MoonIcon, SunIcon } from 'lucide-react'
import { HOME_ROUTE } from '@/auth/components/session'
import { cn } from '@/lib/utils'
import { INTRO_ROUTES } from '../routes'

/** Top-right switch between the dark home page (/) and the light one (/intro/light). */
export function ThemeSwitch({ tone }: { tone: 'dark' | 'light' }) {
  const dark = tone === 'dark'
  return (
    <a
      href={dark ? INTRO_ROUTES.light : HOME_ROUTE}
      aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      className={cn(
        'ml-auto grid size-9 place-items-center rounded-full border backdrop-blur transition-colors', // icon only; the label is for screen readers
        dark ? 'border-white/20 bg-white/5 text-white/85 hover:bg-white/15 hover:text-white' : 'border-black/10 bg-white/70 text-neutral-700 hover:bg-white hover:text-neutral-950',
      )}
    >
      {dark ? <SunIcon className="size-4" aria-hidden="true" /> : <MoonIcon className="size-4" aria-hidden="true" />}
    </a>
  )
}
