import { useState } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { reducers, tables } from '@mesa/bindings'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SPACETIME_DB, SPACETIME_URI } from '@/lib/spacetime'

// Phase 0 connection check. Replaced by My Queue, Alert detail, Shift Handoff and Floor view.
export default function App() {
  const conn = useSpacetimeDB()
  const [operators, ready] = useTable(tables.operator)
  const registerOperator = useReducer(reducers.registerOperator)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const me = conn.identity ? operators.find(o => o.identity.isEqual(conn.identity!)) : undefined

  async function register(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await registerOperator({ name })
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="size-10 rounded-lg" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">MESA</h1>
          <p className="text-sm text-muted-foreground">No alert left unowned.</p>
        </div>
        <Badge className="ml-auto" variant={conn.isActive ? 'success' : 'warning'}>
          {conn.isActive ? 'Connected' : conn.connectionError ? 'Connection failed' : 'Connecting'}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription className="font-mono text-xs">
            {SPACETIME_URI} / {SPACETIME_DB}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 font-mono text-xs text-muted-foreground">
          <div>identity: {conn.identity?.toHexString().slice(0, 16) ?? '…'}</div>
          {conn.connectionError && <div className="text-destructive">{conn.connectionError.message}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operators online</CardTitle>
          <CardDescription>Open this page in a second window. Both update together.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={register} className="flex gap-2">
            <label className="sr-only" htmlFor="name">Your name</label>
            <input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={me ? `Signed in as ${me.name}` : 'Your name'}
              className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
            />
            <Button type="submit" disabled={!conn.isActive || !name.trim()}>
              {me ? 'Rename' : 'Register'}
            </Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!ready ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : operators.length === 0 ? (
            <p className="text-sm text-muted-foreground">No operators yet.</p>
          ) : (
            <ul className="divide-y">
              {operators.map(o => (
                <li key={o.identity.toHexString()} className="flex items-center gap-2 py-2 text-sm">
                  <span className="font-medium">{o.name}</span>
                  <span className="text-muted-foreground">{o.role}</span>
                  <Badge className="ml-auto" variant={o.online ? 'success' : 'secondary'}>
                    {o.online ? 'online' : 'offline'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
