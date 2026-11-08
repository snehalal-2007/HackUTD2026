import { reducers } from '@mesa/bindings'
import { useReducer, useSpacetimeDB } from 'spacetimedb/react'
import { CONSOLE_ROUTE, startSession } from './session'

/**
 * Finishes a sign-in: registers this browser's SpacetimeDB identity as an operator under the
 * given name (when the database is reachable), starts the demo session and opens the Floor view.
 */
export function useSignIn() {
  const conn = useSpacetimeDB()
  const registerOperator = useReducer(reducers.registerOperator)
  return async (name: string) => {
    const display = name.trim()
    if (conn.isActive) {
      try {
        await registerOperator({ name: display })
      } catch {
        // Not fatal: the console still opens; the Operators view lets them register later.
      }
    }
    startSession(display)
    try {
      localStorage.setItem('mesa:view', 'floor')
    } catch {
      // view just won't be remembered
    }
    window.location.hash = `${CONSOLE_ROUTE}/floor`
  }
}
