import { DbConnection } from '@mesa/bindings'

// AI agent. Phase 4: watch new alerts and handoffs, call the predictor and Claude,
// and write results back only through attach_insight and attach_brief.
const uri = process.env.SPACETIME_URI ?? 'ws://localhost:3000'
const db = process.env.SPACETIME_DB ?? 'mesa'

if (!process.env.ANTHROPIC_API_KEY) console.warn('[agent] ANTHROPIC_API_KEY is not set; Claude calls will be skipped')

DbConnection.builder()
  .withUri(uri)
  .withDatabaseName(db)
  .withToken(process.env.AGENT_TOKEN)
  .onConnect((conn, identity) => {
    console.log(`[agent] connected to ${uri}/${db} as ${identity.toHexString().slice(0, 16)}`)
    conn.reducers.registerOperator({ name: 'agent' })
  })
  .onConnectError((_ctx, err) => {
    console.error('[agent] connection failed:', err.message)
    process.exitCode = 1
  })
  .build()
