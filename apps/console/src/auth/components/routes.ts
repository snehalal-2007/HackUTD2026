import { usePath } from '@/lib/route'

// Paths for the sign-in pages (no "#"); see lib/route.ts.
export const AUTH_ROUTES = {
  index: '/auth',
  signIn: '/auth/sign-in',
  operatorSignIn: '/auth/sign-in/operator',
  quickSignIn: '/auth/sign-in/quick',
  createAccount: '/auth/create-account',
  authorize: '/auth/create-account/authorize',
  complete: '/auth/create-account/complete',
} as const

export type AuthRoute = (typeof AUTH_ROUTES)[keyof typeof AUTH_ROUTES]

const ALL = Object.values(AUTH_ROUTES) as string[]

/** The current auth route, or null when the path isn't a sign-in page. */
export function useAuthRoute(): AuthRoute | null {
  const path = usePath().path.replace(/\/$/, '')
  return ALL.includes(path) ? (path as AuthRoute) : null
}
