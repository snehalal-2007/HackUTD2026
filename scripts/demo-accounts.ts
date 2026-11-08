// Demo sign-in accounts for the LOCAL database: Marcus, Priya and Daniel, each a real SpacetimeDB identity.
// Sign in with the first name as both username and password (e.g. Marcus / Marcus).
//
// Each account's token is what makes it that person, so tokens are kept out of git:
//   .demo-accounts.json                          name → identity + token (used by scripts/demo-shifts.sh)
//   apps/console/public/demo-accounts.local.json lowercase name → token (the sign-in page reads it)
// Re-running reuses the saved tokens, so the identities stay the same. Never point this at Maincloud.
//
// Run: pnpm demo:accounts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DbConnection } from '../packages/bindings/src/index.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SAVED = resolve(ROOT, '.demo-accounts.json')
const PUBLIC = resolve(ROOT, 'apps/console/public/demo-accounts.local.json')
const URI = process.env.SPACETIME_URI || 'ws://localhost:3000'
const DB = process.env.SPACETIME_DB || 'mesa'
const NAMES = ['Marcus', 'Priya', 'Daniel']

if (/maincloud/i.test(URI)) throw new Error('demo accounts are for the local database only')

type Saved = Record<string, { identity: string; token: string }>
const saved: Saved = existsSync(SAVED) ? JSON.parse(readFileSync(SAVED, 'utf8')) : {}

function account(name: string): Promise<{ identity: string; token: string }> {
  return new Promise((done, fail) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .withToken(saved[name]?.token)
      .onConnect(async (conn, identity, token) => {
        try {
          await conn.reducers.registerOperator({ name })
          conn.disconnect()
          done({ identity: identity.toHexString(), token })
        } catch (e) {
          fail(e)
        }
      })
      .onConnectError((_ctx, err) => fail(err))
      .build()
  })
}

for (const name of NAMES) {
  saved[name] = await account(name)
  console.log(`${name.padEnd(7)} ${saved[name].identity}  (sign in: ${name} / ${name})`)
}
writeFileSync(SAVED, JSON.stringify(saved, null, 2) + '\n')
writeFileSync(PUBLIC, JSON.stringify(Object.fromEntries(NAMES.map(n => [n.toLowerCase(), saved[n].token])), null, 2) + '\n')
console.log(`Saved to .demo-accounts.json and apps/console/public/demo-accounts.local.json (both git-ignored).`)
process.exit(0)
