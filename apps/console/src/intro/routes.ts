import { useEffect } from 'react'
import { usePath } from '@/lib/route'

export const INTRO_ROUTES = {
  index: '/intro',
  cinematic: '/intro/cinematic',
  countdown: '/intro/countdown',
  handoff: '/intro/handoff',
  grid: '/intro/grid',
} as const

export type IntroRoute = (typeof INTRO_ROUTES)[keyof typeof INTRO_ROUTES]
const ALL = Object.values(INTRO_ROUTES) as string[]

/** The current intro route, or null. Sections scroll in place. */
export function useIntroRoute(): IntroRoute | null {
  const path = usePath().path.replace(/\/$/, '')
  const route = ALL.includes(path) ? (path as IntroRoute) : null
  useEffect(() => { if (route) window.scrollTo({ top: 0 }) }, [route])
  return route
}
