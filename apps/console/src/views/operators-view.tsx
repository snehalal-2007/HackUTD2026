import { useState } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { reducers, tables } from '@mesa/bindings'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SPACETIME_DB, SPACETIME_URI } from '@/lib/spacetime'

// Live from SpacetimeDB: the operator table and register_operator reducer.
export function OperatorsView() {
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
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>{me ? `Signed in as ${me.name}` : 'Register as an operator'}</CardTitle>
            <CardDescription>Your identity comes from this browser's SpacetimeDB connection.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form onSubmit={register} className="flex gap-2">
              <label className="sr-only" htmlFor="op-name">Your name</label>
              <Input
                id="op-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={me ? 'New display name' : 'Your name'}
              />
              <Button type="submit" disabled={!conn.isActive || !name.trim()}>
                {me ? 'Rename' : 'Register'}
              </Button>
            </form>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="font-mono text-xs text-muted-foreground">
              {SPACETIME_URI} / {SPACETIME_DB} · identity {conn.identity?.toHexString().slice(0, 16) ?? '…'}
            </p>
            {conn.connectionError && <p className="text-sm text-destructive">{conn.connectionError.message}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operators</CardTitle>
            <CardDescription>Open MESA in a second window. Both update together.</CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : operators.length === 0 ? (
              <p className="text-sm text-muted-foreground">No operators yet. Register above to be the first.</p>
            ) : (
              <ul className="divide-y">
                {operators.map(o => (
                  <li key={o.identity.toHexString()} className="flex items-center gap-2 py-2 text-sm">
                    <span className="font-medium">{o.name}</span>
                    <span className="text-muted-foreground">{o.role}</span>
                    <Badge className="ml-auto" variant={o.online ? 'success-light' : 'secondary'}>
                      {o.online ? 'online' : 'offline'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
