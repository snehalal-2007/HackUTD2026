import { DbConnection } from '@mesa/bindings'

// Telemetry simulator. Phase 2: stream readings through ingest_reading (one per asset every 2 s)
// and trigger scripted scenarios (cooling failure, power overload, sensor dropout) on cue.
const uri = process.env.SPACETIME_URI ?? 'ws://localhost:3000'
const db = process.env.SPACETIME_DB ?? 'mesa'

DbConnection.builder()
  .withUri(uri)
  .withDatabaseName(db)
  .withToken(process.env.SIMULATOR_TOKEN)
  .onConnect((conn, identity) => {
    console.log(`[simulator] connected to ${uri}/${db} as ${identity.toHexString().slice(0, 16)}`)
    conn.reducers.registerOperator({ name: 'simulator' })
  })
  .onConnectError((_ctx, err) => {
    console.error('[simulator] connection failed:', err.message)
    process.exitCode = 1
  })
  .build()
