import { useEffect, useState } from 'react'

// Hash routes for the sign-in samples, so they work under `vite`, `vite preview` and Vercel
// without a router dependency or server rewrites. The console itself stays on '#/' (no hash).
export const AUTH_ROUTES = {
  index: '#/auth',
  signIn: '#/auth/sign-in',
  operatorSignIn: '#/auth/sign-in/operator',
  quickSignIn: '#/auth/sign-in/quick',
  createAccount: '#/auth/create-account',
  authorize: '#/auth/create-account/authorize',
  complete: '#/auth/create-account/complete',
} as const

export type AuthRoute = (typeof AUTH_ROUTES)[keyof typeof AUTH_ROUTES]

const ALL = Object.values(AUTH_ROUTES) as string[]

function read(): string {
  return window.location.hash.replace(/\/$/, '')
}

/** The current auth route, or null when the hash points at the console. */
export function useAuthRoute(): AuthRoute | null {
  const [hash, setHash] = useState(read)
  useEffect(() => {
    const onChange = () => setHash(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return ALL.includes(hash) ? (hash as AuthRoute) : null
}
