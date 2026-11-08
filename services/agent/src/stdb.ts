// The only file that talks to SpacetimeDB. The agent reads through a subscription and writes only
// through attach_report, attach_shift_report, add_agent_step and answer_agent (the module enforces this).
import { DbConnection } from '@mesa/bindings'

const QUERIES = [
  'SELECT * FROM incident',
  'SELECT * FROM incident_report',
  'SELECT * FROM event_log',
  'SELECT * FROM datacenter',
  'SELECT * FROM rack',
  'SELECT * FROM server_latest',
  'SELECT * FROM feed_health',
  'SELECT * FROM threshold',
  'SELECT * FROM shift',
  'SELECT * FROM shift_report',
  'SELECT * FROM agent_chat',
]

let c: DbConnection | null = null
export const conn = () => {
  if (!c) throw new Error('not connected')
  return c
}
export const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)

export type IncidentRow = ReturnType<typeof incidents>[number]
export type ChatRow = ReturnType<typeof chats>[number]
export type ShiftRow = ReturnType<typeof shifts>[number]

export const incidents = () => [...conn().db.incident.iter()]
export const chats = () => [...conn().db.agentChat.iter()]
export const shifts = () => [...conn().db.shift.iter()]
export const racks = () => [...conn().db.rack.iter()]
export const datacenters = () => [...conn().db.datacenter.iter()]
export const feeds = () => [...conn().db.feedHealth.iter()]
export const thresholds = () => [...conn().db.threshold.iter()]
export const servers = () => [...conn().db.serverLatest.iter()]
export const reports = () => [...conn().db.incidentReport.iter()]
export const events = () => [...conn().db.eventLog.iter()].sort((a, b) => (a.seq < b.seq ? -1 : 1))

export const hasIncidentReport = (incidentId: bigint, kind: string) => reports().some(r => r.incidentId === incidentId && r.kind === kind)
export const hasShiftReport = (shiftId: bigint) => !!conn().db.shiftReport.shiftId.find(shiftId)

export async function attachReport(incidentId: bigint, kind: 'final' | 'interim', reportJson: string, source: 'claude' | 'template') {
  await conn().reducers.attachReport({ incidentId, kind, reportJson, source })
}
export async function attachShiftReport(shiftId: bigint, reportJson: string, source: 'claude' | 'template') {
  await conn().reducers.attachShiftReport({ shiftId, reportJson, source })
}
export async function addStep(chatId: bigint, kind: 'thinking' | 'lookup' | 'result' | 'error', title: string, detail: string) {
  await conn().reducers.addAgentStep({ chatId, kind, title, detail })
}
export async function answer(chatId: bigint, outcome: 'answered' | 'failed', text: string, model: string, source: 'claude' | 'unavailable', durationMs: number) {
  await conn().reducers.answerAgent({ chatId, outcome, answer: text, model, source, durationMs: Math.min(durationMs, 4_294_967_295) })
}

export interface Handlers {
  onShift: (row: ShiftRow) => void
  onChat: (row: ChatRow) => void
  onReady: () => void
}

export function connect(opts: { uri: string; db: string; token?: string }, h: Handlers) {
  DbConnection.builder()
    .withUri(opts.uri)
    .withDatabaseName(opts.db)
    .withToken(opts.token)
    .onConnect((connection, identity, token) => {
      c = connection
      console.log(`[agent] connected to ${opts.uri}/${opts.db} as ${identity.toHexString()}`)
      if (!opts.token) {
        console.log('[agent] No AGENT_TOKEN set. To keep this identity, put this in .env (never commit it):')
        console.log(`AGENT_TOKEN=${token}`)
        console.log(`[agent] Then allow-list it as the database owner: spacetime sql ${opts.db} "INSERT INTO agent_identity (identity) VALUES (0x${identity.toHexString()})"`)
      }
      connection.db.shift.onUpdate((_ctx, _old, row) => h.onShift(row))
      connection.db.agentChat.onInsert((_ctx, row) => h.onChat(row))
      connection.subscriptionBuilder().onApplied(() => h.onReady()).subscribe(QUERIES)
    })
    .onDisconnect(() => {
      console.error('[agent] disconnected; exiting so the host restarts it')
      process.exit(1)
    })
    .onConnectError((_ctx, err) => {
      console.error('[agent] connection failed:', err.message)
      process.exit(1)
    })
    .build()
}
