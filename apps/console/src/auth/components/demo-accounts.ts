import { TOKEN_KEY } from '@/lib/spacetime'

// Local demo accounts (Marcus, Priya, Daniel) made by scripts/demo-accounts.ts. Each is a real SpacetimeDB identity;
// its token sits in public/demo-accounts.local.json, which is git-ignored and only exists on a machine that ran the
// script, so a deployed console has no demo accounts. The password is the first name. This is a demo login, not
// real authentication: anyone who can load that file can be these accounts.

const OWN_KEY = `${TOKEN_KEY}:own` // this browser's own identity, kept while it's signed in as a demo account

async function load(): Promise<Record<string, string>> {
  try {
    const res = await fetch('/demo-accounts.local.json', { cache: 'no-store' })
    return res.ok ? await res.json() : {}
  } catch {
    return {}
  }
}

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* storage blocked */ } }

export type DemoSignIn = { kind: 'demo'; name: string } | { kind: 'wrong-password' } | { kind: 'none' }

/** Checks a username and password against the demo accounts; on a match, switches this browser to that identity. */
export async function demoSignIn(username: string, password: string): Promise<DemoSignIn> {
  const key = username.trim().toLowerCase()
  const accounts = await load()
  const token = accounts[key]
  if (!token) return { kind: 'none' }
  if (password.trim().toLowerCase() !== key) return { kind: 'wrong-password' }
  const current = read(TOKEN_KEY)
  if (!Object.values(accounts).includes(current ?? '')) write(OWN_KEY, current) // remember who this browser was
  write(TOKEN_KEY, token)
  return { kind: 'demo', name: key[0].toUpperCase() + key.slice(1) }
}

/** Signing in as anyone else: if this browser is currently a demo account, go back to its own identity. Returns true when that needs a reload. */
export async function leaveDemoAccount(): Promise<boolean> {
  const accounts = await load()
  const current = read(TOKEN_KEY)
  if (!current || !Object.values(accounts).includes(current)) return false
  write(TOKEN_KEY, read(OWN_KEY)) // null: a fresh identity on the next connect
  write(OWN_KEY, null)
  return true
}
