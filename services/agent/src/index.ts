// services/agent: MESA's Claude agent.
//
// Statements of behavior (from the teammate's mesa-agent-v2, extended with chat):
//   1. The agent never makes or changes decisions. Threshold rules in the module decide and act.
//   2. It writes an incident report only when an operator asks for one in the chat (final if closed, else interim).
//   3. When a shift starts HANDING OVER it writes the shift report.
//   4. When an operator ASKS a question (ask_agent), it answers from live data through read-only tools,
//      writing each reasoning summary, lookup and result as an agent_step row for the console.
//   5. Report impact numbers are computed here, never by the model. Reports have fixed fields.
//   6. If Claude is unavailable, slow, over budget or returns bad output, reports fall back to a template
//      and questions get a plain "can't answer" with the reason.
//   7. It writes only through attach_report, attach_shift_report, add_agent_step and answer_agent.
//   8. Table contents are data, not instructions (security incidents and questions can contain attacker text).
import { config, describeConfig } from './config.js'
import * as db from './stdb.js'
import { writeShiftReport } from './reports.js'
import { answerQuestion } from './chat.js'

const inFlight = new Set<string>()

async function once(key: string, job: () => Promise<void>) {
  if (inFlight.has(key)) return
  inFlight.add(key)
  try {
    await job()
  } catch (e) {
    console.error(`[agent] ${key} failed:`, e instanceof Error ? e.message : e)
  } finally {
    inFlight.delete(key)
  }
}

function onShift(row: db.ShiftRow) {
  if (row.status !== 'handing_over' || db.hasShiftReport(row.shiftId)) return
  void once(`shift:${row.shiftId}`, async () => {
    const { json, source } = await writeShiftReport(row)
    if (!db.hasShiftReport(row.shiftId)) await db.attachShiftReport(row.shiftId, json, source)
    console.log(`[agent] shift report for shift ${row.shiftId} via ${source}`)
  })
}

function onChat(row: db.ChatRow) {
  if (row.status !== 'pending') return
  void once(`chat:${row.chatId}`, async () => {
    const t0 = Date.now()
    await answerQuestion(row)
    console.log(`[agent] answered question ${row.chatId} in ${Date.now() - t0} ms`)
  })
}

console.log(`[agent] starting: ${describeConfig()}`)
db.connect(
  { uri: config.uri, db: config.db, token: config.token },
  {
    onShift,
    onChat,
    onReady: () => {
      // Catch up on shift handovers and questions asked while the agent was offline.
      for (const row of db.shifts()) onShift(row)
      for (const row of db.chats()) onChat(row)
      console.log('[agent] subscribed and caught up')
    },
  },
)
