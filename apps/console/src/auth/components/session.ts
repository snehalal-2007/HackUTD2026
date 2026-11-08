// Demo session for the sign-in pages. The MESA module has no password accounts yet, so signing in
// does not check a password: it remembers the name for this browser tab and opens the console.
// Replace this with real authentication when the module gains accounts.

const KEY = 'mesa:session'
let memory: string | null = null // fallback when sessionStorage is blocked

export const HOME_ROUTE = '/'
export const CONSOLE_ROUTE = '/console'

export function signedInAs(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return memory
  }
}

export function startSession(name: string) {
  memory = name
  try {
    sessionStorage.setItem(KEY, name)
  } catch {
    // Storage blocked: the session lasts until reload.
  }
}

export function endSession() {
  memory = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}
