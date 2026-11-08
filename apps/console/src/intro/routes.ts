import { useEffect, useState } from 'react'

export const INTRO_ROUTES = {
  index: '#/intro',
  cinematic: '#/intro/cinematic',
  countdown: '#/intro/countdown',
  handoff: '#/intro/handoff',
  grid: '#/intro/grid',
} as const

export type IntroRoute = (typeof INTRO_ROUTES)[keyof typeof INTRO_ROUTES]
const ALL = Object.values(INTRO_ROUTES) as string[]

/** The current intro route, or null. Section anchors (#/intro/grid?s=…) aren't used; sections scroll in place. */
export function useIntroRoute(): IntroRoute | null {
  const read = () => window.location.hash.replace(/\/$/, '')
  const [hash, setHash] = useState(read)
  useEffect(() => {
    const on = () => {
      setHash(read())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return ALL.includes(hash) ? (hash as IntroRoute) : null
}
