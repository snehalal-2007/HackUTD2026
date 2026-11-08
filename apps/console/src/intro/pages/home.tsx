import { Landing } from './landing'

/** The public home page (/), dark theme. The layout lives in landing.tsx, shared with the light page. */
export function HomePage() {
  return <Landing tone="dark" />
}
