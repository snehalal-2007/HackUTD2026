import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { Timestamp } from 'spacetimedb'
import { DbConnection } from '@mesa/bindings'
import type { ReadingIn } from '@mesa/bindings/types'
import { loadTicks, type SampleRow } from './data'

// Replays real OLCF Summit telemetry (ClusterWise, CC BY 4.0) into SpacetimeDB as
// live feeds from eight data centers. Timestamps are shifted to "now", so readings
// arrive as if they were happening live. See docs/TELEMETRY.md.

const here = dirname(fileURLToPath(import.meta.url))
// `pnpm replay -- --speed 10` forwards a literal "--"; drop it so both forms work.
const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'))
const { values: args } = parseArgs({
  args: argv,
  options: {
    file: { type: 'string', default: resolve(here, '../data/summit-sample.csv.gz') },
    // 1 = real time (a sample every ~10 s); 4 = every 2.5 s. REPLAY_SPEED sets it on Railway.
    speed: { type: 'string', default: process.env.REPLAY_SPEED || '1' },
    sites: { type: 'string' }, // comma-separated datacenter ids; default all
    loops: { type: 'string', default: '0' }, // 0 = loop forever
    feed: { type: 'string', default: 'all' }, // names the stored identity for this feed
  },
})

const uri = process.env.SPACETIME_URI ?? 'ws://localhost:3000'
const db = process.env.SPACETIME_DB ?? 'mesa'
const speed = Number(args.speed)
const loops = Number(args.loops)
if (!(speed > 0)) throw new Error('--speed must be a positive number')

const sites = args.sites ? new Set(args.sites.split(',').map(s => s.trim()).filter(Boolean)) : undefined
const ticks = loadTicks(args.file!, sites)
const datacenters = new Set(ticks.flatMap(t => [...t.byDatacenter.keys()]))
const servers = new Set(ticks.flatMap(t => [...t.byDatacenter.values()].flat().map(r => r.serverId)))
const spanMs = ticks[ticks.length - 1].offsetMs
const stepMs = ticks.length > 1 ? spanMs / (ticks.length - 1) : 10_000

// Each feed keeps one identity across restarts: the module lets only the identity
// that first streamed a data center keep streaming it.
const tokenFile = resolve(here, '../../../.replayer-tokens.json')
const tokenKey = `${uri}|${db}|${args.feed}`
function readTokens(): Record<string, string> {
  try {
    return existsSync(tokenFile) ? JSON.parse(readFileSync(tokenFile, 'utf8')) : {}
  } catch {
    return {}
  }
}
const token = process.env.REPLAYER_TOKEN || readTokens()[tokenKey] // || not ??: an empty REPLAYER_TOKEN= in .env must fall back to the saved token

function toReading(row: SampleRow, measuredAtMs: number, seq: bigint): ReadingIn {
  return {
    region: row.region,
    datacenterName: row.datacenterName,
    rackId: row.rackId,
    serverId: row.serverId,
    sourceHostname: row.sourceHostname,
    seq,
    measuredAt: new Timestamp(BigInt(Math.round(measuredAtMs)) * 1000n),
    nodeState: row.nodeState,
    jobActive: row.jobActive,
    gpuFailure: row.gpuFailure,
    gpuTempC: row.gpuTempC,
    cpuTempC: row.cpuTempC,
    gpuPowerW: row.gpuPowerW,
    cpuPowerW: row.cpuPowerW,
    nodePowerW: row.nodePowerW,
    gpuUtilPct: row.gpuUtilPct,
    cpuUtilPct: row.cpuUtilPct,
    source: 'summit',
  }
}

let finished = false
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function run(conn: DbConnection) {
  console.log(
    `[replayer] ${datacenters.size} data centers, ${servers.size} servers, ${ticks.length} samples ` +
      `(${Math.round(spanMs / 60000)} min of data) at ${speed}x: one batch per data center every ` +
      `${(stepMs / speed / 1000).toFixed(1)} s`,
  )
  const startMs = Date.now()
  // seq must keep rising across loops and restarts, so it is based on wall-clock time.
  const seqBase = BigInt(startMs) * 1000n
  let sent = 0
  let failed = 0

  for (let loop = 0; loops === 0 || loop < loops; loop++) {
    for (let i = 0; i < ticks.length; i++) {
      const tick = ticks[i]
      const elapsedData = loop * (spanMs + stepMs) + tick.offsetMs
      const dueMs = startMs + elapsedData / speed
      const wait = dueMs - Date.now()
      if (wait > 0) await sleep(wait)

      // Stamp readings with the wall-clock time they are sent. Mapping data time onto now
      // (startMs + elapsedData) ran ahead of the clock at any speed above 1x.
      const measuredAtMs = dueMs
      const seq = seqBase + BigInt(loop * ticks.length + i)
      const calls = [...tick.byDatacenter].map(([datacenterId, rows]) =>
        conn.reducers
          .ingestReadings({ datacenterId, readings: rows.map(r => toReading(r, measuredAtMs, seq)) })
          .then(() => {
            sent += rows.length
          })
          .catch((err: unknown) => {
            failed++
            console.error(`[replayer] ${datacenterId}: ${err instanceof Error ? err.message : String(err)}`)
          }),
      )
      await Promise.all(calls)
      if (i % 30 === 0) {
        console.log(`[replayer] loop ${loop + 1} sample ${i + 1}/${ticks.length}: ${sent} readings sent, ${failed} failed batches`)
      }
    }
  }
  console.log(`[replayer] done: ${sent} readings sent, ${failed} failed batches`)
  finished = true
  conn.disconnect()
}

DbConnection.builder()
  .withUri(uri)
  .withDatabaseName(db)
  .withToken(token)
  .onConnect((conn, identity, newToken) => {
    console.log(`[replayer] connected to ${uri}/${db} as ${identity.toHexString().slice(0, 16)} (feed "${args.feed}")`)
    if (!process.env.REPLAYER_TOKEN) {
      try {
        writeFileSync(tokenFile, JSON.stringify({ ...readTokens(), [tokenKey]: newToken }, null, 2))
      } catch (err) {
        console.warn('[replayer] could not save the feed identity:', err)
      }
    }
    run(conn).catch(err => {
      console.error('[replayer] stopped:', err)
      process.exitCode = 1
      conn.disconnect()
    })
  })
  .onConnectError((_ctx, err) => {
    console.error('[replayer] connection failed:', err.message)
    process.exit(1)
  })
  // A schema publish or network drop disconnects every client. Exit so the host
  // (Railway restarts on failure) brings up a fresh connection, unless we finished.
  .onDisconnect((_ctx, err) => {
    if (finished) return
    console.error('[replayer] disconnected:', err?.message ?? 'connection closed')
    process.exit(1)
  })
  .build()
