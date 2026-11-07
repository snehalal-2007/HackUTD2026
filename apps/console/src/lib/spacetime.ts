import { DbConnection } from '@mesa/bindings'

export const SPACETIME_URI = import.meta.env.VITE_SPACETIME_URI ?? 'ws://localhost:3000'
export const SPACETIME_DB = import.meta.env.VITE_SPACETIME_DB ?? 'mesa'

const tokenKey = `mesa:token:${SPACETIME_URI}:${SPACETIME_DB}`

function readToken(): string | undefined {
  try {
    return localStorage.getItem(tokenKey) ?? undefined
  } catch {
    return undefined
  }
}

function saveToken(token: string) {
  try {
    localStorage.setItem(tokenKey, token)
  } catch {
    // Private mode or blocked storage: the server issues a new identity next time.
  }
}

export const connectionBuilder = DbConnection.builder()
  .withUri(SPACETIME_URI)
  .withDatabaseName(SPACETIME_DB)
  .withToken(readToken())
  .onConnect((_conn, _identity, token) => saveToken(token))
