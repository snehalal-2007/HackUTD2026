import { reducers } from '@mesa/bindings'
import { useReducer, useSpacetimeDB } from 'spacetimedb/react'
import { CONSOLE_ROUTE, startSession } from './session'
import { demoSignIn, leaveDemoAccount } from './demo-accounts'

const remember = (view: string) => {
  try {
    localStorage.setItem('mesa:view', view)
  } catch {
    // view just won't be remembered
  }
}

/**
 * Finishes a sign-in. Returns an error message to show, or null when it went through.
 * - A demo account (Marcus, Priya, Daniel; password = first name): this browser becomes that identity and the
 *   console reloads on My Queue.
 * - Anyone else: registers this browser's own SpacetimeDB identity as an operator under the given name and opens
 *   the Floor view. There is no password check for them yet.
 */
export function useSignIn() {
  const conn = useSpacetimeDB()
  const registerOperator = useReducer(reducers.registerOperator)
  return async (name: string, password = ''): Promise<string | null> => {
    const display = name.trim()
    const demo = await demoSignIn(display, password)
    if (demo.kind === 'wrong-password') return 'Wrong password.'
    if (demo.kind === 'demo') {
      startSession(demo.name)
      remember('queue')
      window.location.hash = `${CONSOLE_ROUTE}/queue`
      window.location.reload() // reconnect as that identity
      return null
    }
    if (await leaveDemoAccount()) {
      // Back to this browser's own identity; it keeps the name it already had.
      startSession(display)
      remember('floor')
      window.location.hash = `${CONSOLE_ROUTE}/floor`
      window.location.reload()
      return null
    }
    if (conn.isActive) {
      try {
        await registerOperator({ name: display })
      } catch {
        // Not fatal: the console still opens; the Operators view lets them register later.
      }
    }
    startSession(display)
    remember('floor')
    window.location.hash = `${CONSOLE_ROUTE}/floor`
    return null
  }
}
