// Answers operator questions from live data. Claude looks things up through read-only tools over the agent's
// subscription cache; every reasoning summary, lookup and result is written as an agent_step row so the console
// can show the thought process live. The agent cannot change anything: it has no write tools.
import type Anthropic from '@anthropic-ai/sdk'
import { config } from './config.js'
import { FALLBACK, client, describeError, takeBudget } from './llm.js'
import { CHAT_ROLE } from './prompts.js'
import { consoleNames, describeRack, placeName, type ConsoleName } from './names.js'
import { writeIncidentReport } from './reports.js'
import * as db from './stdb.js'

type Tool = Anthropic.Beta.BetaTool
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object' as const, properties, required, additionalProperties: false })

const TOOLS: Tool[] = [
  { name: 'get_floor_status', strict: true, description: 'Every data center with its feed health, and every rack with hottest GPU (°C), power (kW), servers at or over 50 °C, and where the console shows it. Also the rule thresholds.', input_schema: obj({}, []) },
  { name: 'list_incidents', strict: true, description: 'Incidents opened by the threshold rules (or manually), newest first.', input_schema: obj({ status: { type: 'string', enum: ['active', 'all'], description: 'active = not closed' } }, ['status']) },
  { name: 'get_rack', strict: true, description: 'One rack in detail: its 18 servers with GPU/CPU temperature, power, job and GPU-failure flags. Accepts a rack id (dc-spartanburg/a18) or a console block name (A1, D3).', input_schema: obj({ rack: { type: 'string' } }, ['rack']) },
  { name: 'get_event_log', strict: true, description: 'The newest entries of the hash-chained audit log (rule decisions, reports, operator actions).', input_schema: obj({ limit: { type: 'integer', description: '1 to 40' } }, ['limit']) },
  { name: 'get_incident_report', strict: true, description: 'The report already written for an incident (final or interim), if any.', input_schema: obj({ incident_id: { type: 'string' } }, ['incident_id']) },
  { name: 'write_incident_report', strict: true, description: 'Write and attach a report for one incident (final if it is closed, interim otherwise). Only use this when the operator explicitly asks for a report.', input_schema: obj({ incident_id: { type: 'string' } }, ['incident_id']) },
]

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`
}
const r1 = (n: number) => Math.round(n * 10) / 10
/** The console's server name: "dc-x/a18n07" in rack row A → "A2-n07" (blocks hold servers 1–6, 7–12, 13–18). */
const serverName = (serverId: string, n: ConsoleName | undefined) => {
  const no = Number(/n(\d+)$/.exec(serverId)?.[1] ?? 0)
  return n ? `${n.blocks[0]}${Math.min(3, Math.floor((no - 1) / 6) + 1)}-n${String(no).padStart(2, '0')}` : serverId.split('/')[1]
}

/** Runs one tool; returns a short title for the panel and the JSON the model sees. */
async function runTool(name: string, input: Record<string, unknown>): Promise<{ title: string; summary: string; result: unknown }> {
  const names = consoleNames(db.racks().map(r => r.rackId))
  if (name === 'get_floor_status') {
    const servers = db.servers()
    const racks = db.racks().map(r => ({
      rack: describeRack(r.rackId, names.get(r.rackId)),
      hottest_gpu_c: r1(r.gpuTempMaxC), power_kw: r1(r.powerKw),
      servers_at_or_over_50c: servers.filter(s => s.rackId === r.rackId && s.gpuTempC >= 50).length,
      updated: ago(db.ms(r.updatedAt)),
    }))
    const feeds = new Map(db.feeds().map(f => [f.datacenterId, f]))
    const dcs = db.datacenters().map(d => ({ id: d.datacenterId, name: placeName(d.datacenterId), region: d.region, last_batch: feeds.get(d.datacenterId) ? ago(db.ms(feeds.get(d.datacenterId)!.lastIngestAt)) : 'never', feed_silent: feeds.get(d.datacenterId)?.stale ?? false }))
    const hot = racks.filter(r => r.hottest_gpu_c >= 50).length
    return { title: 'Read floor status', summary: `${dcs.length} floors, ${racks.length} racks; ${hot} rack(s) at or over 50 °C`, result: { data_centers: dcs, racks, thresholds: db.thresholds() } }
  }
  if (name === 'list_incidents') {
    const active = input.status !== 'all'
    const list = db.incidents().filter(i => !active || i.status !== 'closed').sort((a, b) => (a.incidentId < b.incidentId ? 1 : -1)).slice(0, 25)
    const rows = list.map(i => ({
      id: i.incidentId.toString(), title: i.title, where: placeName(i.datacenterId), kind: i.kind, severity: i.severity, status: i.status,
      rack: i.rackId ? describeRack(i.rackId, names.get(i.rackId)) : null, peak: i.peakValue, opened: ago(db.ms(i.openedAt)),
      closed_reason: i.closedReason || null, reports: db.reports().filter(r => r.incidentId === i.incidentId).map(r => r.kind),
    }))
    return { title: active ? 'Read active incidents' : 'Read all incidents', summary: `${rows.length} incident(s)`, result: rows }
  }
  if (name === 'get_rack') {
    const q = String(input.rack ?? '').trim()
    const byBlock = /^[A-Za-z][1-3]$/.test(q) ? [...names.entries()].find(([, n]) => n.blocks.startsWith(q[0].toUpperCase())) : undefined
    const rackId = byBlock ? byBlock[0] : q
    const rack = db.racks().find(r => r.rackId === rackId)
    if (!rack) return { title: `Look up rack ${q}`, summary: 'not found', result: { error: `No rack "${q}". Rack ids look like dc-spartanburg/a18; console blocks look like A1.` } }
    const servers = db.servers().filter(s => s.rackId === rackId).sort((a, b) => b.gpuTempC - a.gpuTempC).map(s => ({
      server: serverName(s.serverId, names.get(rackId)), gpu_c: r1(s.gpuTempC), cpu_c: r1(s.cpuTempC), power_w: Math.round(s.nodePowerW),
      job_active: s.jobActive, gpu_failure: s.gpuFailure, gpu_util_pct_est: Math.round(s.gpuUtilPct),
    }))
    const label = describeRack(rackId, names.get(rackId))
    return { title: `Read rack ${label}`, summary: `hottest GPU ${r1(rack.gpuTempMaxC)} °C, ${servers.filter(s => s.gpu_c >= 50).length} of ${servers.length} servers ≥ 50 °C`, result: { rack: label, hottest_gpu_c: r1(rack.gpuTempMaxC), power_kw: r1(rack.powerKw), servers } }
  }
  if (name === 'get_event_log') {
    const n = Math.max(1, Math.min(40, Number(input.limit) || 15))
    const rows = db.events().slice(-n).reverse().map(e => ({ seq: e.seq.toString(), when: ago(db.ms(e.at)), actor: e.actor, action: e.action, target: e.target }))
    return { title: `Read the last ${n} audit events`, summary: `${rows.length} event(s)`, result: rows }
  }
  if (name === 'get_incident_report') {
    const id = String(input.incident_id ?? '').replace(/^#/, '')
    const reps = db.reports().filter(r => r.incidentId.toString() === id)
    if (!reps.length) return { title: `Read report for incident #${id}`, summary: 'no report yet', result: { note: `No report for incident ${id} yet. Reports are written when an incident escalates or closes.` } }
    return { title: `Read report for incident #${id}`, summary: reps.map(r => `${r.kind} (${r.source})`).join(', '), result: reps.map(r => ({ kind: r.kind, source: r.source, report: JSON.parse(r.reportJson) })) }
  }
  if (name === 'write_incident_report') {
    const id = String(input.incident_id ?? '').replace(/^#/, '')
    const inc = db.incidents().find(i => i.incidentId.toString() === id)
    if (!inc) return { title: `Write report for incident #${id}`, summary: 'no such incident', result: { error: `No incident ${id}.` } }
    const kind = inc.status === 'closed' ? 'final' : 'interim'
    if (db.hasIncidentReport(inc.incidentId, kind)) return { title: `Write ${kind} report for incident #${id}`, summary: 'already written', result: { note: `A ${kind} report for incident ${id} already exists; it is in the chat.` } }
    const { json, source } = await writeIncidentReport(inc, kind)
    await db.attachReport(inc.incidentId, kind, json, source)
    return { title: `Write ${kind} report for incident #${id}`, summary: `attached (${source === 'claude' ? 'AI drafted' : 'template'})`, result: { attached: true, kind, report: JSON.parse(json) } }
  }
  return { title: `Unknown tool ${name}`, summary: 'not available', result: { error: 'unknown tool' } }
}

/** This operator's earlier answered questions, so follow-ups ("and the second one?") make sense. Each operator has their own conversation. */
function history(before: bigint, askedBy: db.ChatRow['askedBy']): Anthropic.Beta.BetaMessageParam[] {
  return db.chats()
    .filter(c => c.chatId < before && c.status === 'answered' && c.askedBy.isEqual(askedBy))
    .sort((a, b) => (a.chatId < b.chatId ? -1 : 1))
    .slice(-4)
    .flatMap(c => [
      { role: 'user' as const, content: `<question from="${c.askerName.replace(/[<>"]/g, '')}">${c.question}</question>` },
      { role: 'assistant' as const, content: c.answer },
    ])
}

export async function answerQuestion(chat: db.ChatRow) {
  const t0 = Date.now()
  const step = (kind: 'thinking' | 'lookup' | 'result' | 'error', title: string, detail = '') => db.addStep(chat.chatId, kind, title, detail)
  const finish = (outcome: 'answered' | 'failed', text: string, source: 'claude' | 'unavailable') => db.answer(chat.chatId, outcome, text, source === 'claude' ? config.model : '', source, Date.now() - t0)

  if (!client) {
    await step('error', 'Claude is not configured', 'ANTHROPIC_API_KEY is not set for the agent service.')
    return finish('failed', "I can't answer questions right now: the agent has no Claude API key configured. Incident reports still arrive from templates.", 'unavailable')
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history(chat.chatId, chat.askedBy),
    { role: 'user', content: `<question from="${chat.askerName.replace(/[<>"]/g, '')}">${chat.question}</question>` },
  ]
  try {
    for (let turn = 0; turn < 6; turn++) {
      if (!takeBudget()) {
        await step('error', 'Over the per-minute budget', 'Too many Claude calls this minute.')
        return finish('failed', "I'm over my per-minute budget for Claude calls. Ask again in a minute.", 'unavailable')
      }
      const res = await client.beta.messages.create(
        {
          model: config.model,
          max_tokens: 16000,
          ...FALLBACK,
          thinking: { type: 'adaptive', display: 'summarized' }, // readable reasoning summary for the panel
          output_config: { effort: config.effort },
          system: CHAT_ROLE,
          tools: TOOLS,
          messages,
        },
        { timeout: config.llmTimeoutMs },
      )
      for (const b of res.content) {
        if (b.type === 'thinking' && b.thinking.trim()) await step('thinking', 'Reasoning', b.thinking.trim())
      }
      if (res.stop_reason === 'refusal') {
        await step('error', 'Declined', 'The model declined to answer this question.')
        return finish('failed', 'I can’t help with that question.', 'claude')
      }
      const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
      if (res.stop_reason !== 'tool_use' || !uses.length) {
        const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('\n').trim()
        return finish('answered', text || 'I could not form an answer from the data.', 'claude')
      }
      messages.push({ role: 'assistant', content: res.content }) // full content, thinking blocks included, unchanged
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const u of uses) {
        const out = await runTool(u.name, (u.input ?? {}) as Record<string, unknown>)
        await step('lookup', out.title, JSON.stringify(u.input))
        const json = JSON.stringify(out.result)
        await step('result', out.summary, json.length > 1500 ? `${json.slice(0, 1500)}…` : json)
        results.push({ type: 'tool_result', tool_use_id: u.id, content: json })
      }
      messages.push({ role: 'user', content: results }) // every tool result in one message
    }
    await step('error', 'Stopped after 6 rounds of lookups', '')
    return finish('failed', 'I looked at a lot of data but could not settle on an answer. Try a narrower question.', 'claude')
  } catch (err) {
    const why = describeError(err)
    console.warn(`[agent] chat ${chat.chatId} failed: ${why}`)
    await step('error', 'Could not reach an answer', why)
    return finish('failed', `I couldn't answer: ${why}.`, 'unavailable')
  }
}
