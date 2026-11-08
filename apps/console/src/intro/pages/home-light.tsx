import { Landing } from './landing'

/** The home page in the console's light theme (/intro/light). The layout lives in landing.tsx, shared with the dark page. */
export function LightHomePage() {
  return <Landing tone="light" />
}
