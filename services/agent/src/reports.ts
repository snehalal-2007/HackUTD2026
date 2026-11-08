// Incident and shift reports (the teammate's mesa-agent-v2 design, adapted to the current schema):
// fixed fields, impact numbers computed here and never by the model, a template when Claude is unavailable.
import { z } from 'zod'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { config } from './config.js'
import { FALLBACK, client, describeError, takeBudget } from './llm.js'
import { INCIDENT_TASK, INTERIM_TASK, REPORT_ROLE, SHIFT_TASK } from './prompts.js'
import { consoleNames, describeRack } from './names.js'
import * as db from './stdb.js'

const IncidentReport = z.object({
  summary: z.string(),
  timeline: z.array(z.object({ ts: z.string(), text: z.string() })),
  automated_actions: z.array(z.object({ rule: z.string(), result: z.string() })),
  likely_cause: z.string(),
  follow_ups: z.array(z.string()),
})
const ShiftReport = z.object({
  summary: z.string(),
  incidents: z.array(z.object({ incident_id: z.string(), title: z.string(), status: z.string(), note: z.string() })),
  watch_next: z.array(z.string()),
})
type Source = 'claude' | 'template'

const hhmmss = (msSinceEpoch: number) => new Date(msSinceEpoch).toISOString().slice(11, 19)

function contextFor(inc: db.IncidentRow) {
  const opened = db.ms(inc.openedAt)
  const end = inc.status === 'closed' ? db.ms(inc.updatedAt) : Date.now()
  const log = db.events().filter(e => e.incidentId === inc.incidentId)
  const names = consoleNames(db.racks().map(r => r.rackId))
  const rack = inc.rackId ? db.racks().find(r => r.rackId === inc.rackId) : undefined
  const impact = {
    kind: inc.kind,
    severity: inc.severity,
    peak_value: inc.kind === 'gpu_temp' ? `${inc.peakValue.toFixed(1)} °C` : inc.kind === 'feed_stale' ? `${Math.round(inc.peakValue)} s silent` : String(inc.peakValue),
    duration_s: Math.max(0, Math.round((end - opened) / 1000)),
  }
  const payload = {
    incident: {
      id: inc.incidentId.toString(), title: inc.title, kind: inc.kind, severity: inc.severity, status: inc.status,
      data_center: inc.datacenterId, rack: inc.rackId ? describeRack(inc.rackId, names.get(inc.rackId)) : null,
      opened_at: hhmmss(opened), updated_at: hhmmss(db.ms(inc.updatedAt)), closed_reason: inc.closedReason || null, source: inc.source,
    },
    impact,
    rack_now: rack ? { hottest_gpu_c: rack.gpuTempMaxC, power_kw: +rack.powerKw.toFixed(1), servers: rack.servers } : null,
    log: log.map(e => ({ ts: hhmmss(db.ms(e.at)), actor: e.actor, action: e.action, target: e.target })),
  }
  return { inc, log, impact, payload }
}

function templateIncident(ctx: ReturnType<typeof contextFor>, kind: 'final' | 'interim') {
  const { inc, log, impact } = ctx
  return {
    summary: kind === 'final'
      ? `${inc.title}. The incident closed after ${Math.round(impact.duration_s / 60)} min (${inc.closedReason || 'reason not recorded'}).`
      : `${inc.title}. It escalated to ${inc.severity} and needs a human to look at it.`,
    impact,
    timeline: log.slice(0, 12).map(e => ({ ts: hhmmss(db.ms(e.at)), text: `${e.actor}: ${e.action} (${e.target})` })),
    automated_actions: log.filter(e => e.actor === 'rules').map(e => ({ rule: e.action, result: e.target })),
    likely_cause: 'Likely cause (hypothesis): not assessed; this report was written from a template without Claude.',
    follow_ups: [],
    ai_drafted: false,
  }
}

export async function writeIncidentReport(inc: db.IncidentRow, kind: 'final' | 'interim'): Promise<{ json: string; source: Source }> {
  const ctx = contextFor(inc)
  const fallback = () => ({ json: JSON.stringify(templateIncident(ctx, kind)), source: 'template' as const })
  if (!client || !takeBudget()) return fallback()
  try {
    const res = await client.beta.messages.parse(
      {
        model: config.model,
        max_tokens: 4000,
        ...FALLBACK,
        output_config: { effort: 'low', format: betaZodOutputFormat(IncidentReport) },
        system: REPORT_ROLE,
        messages: [{ role: 'user', content: `${kind === 'final' ? INCIDENT_TASK : INTERIM_TASK}\n\n<incident>${JSON.stringify(ctx.payload)}</incident>` }],
      },
      { timeout: config.llmTimeoutMs },
    )
    const out = res.parsed_output
    if (res.stop_reason === 'refusal' || !out || !out.summary.trim()) return fallback()
    let cause = out.likely_cause.trim()
    if (cause && !/hypothesis/i.test(cause)) cause = `Likely cause (hypothesis): ${cause}`
    return {
      source: 'claude',
      json: JSON.stringify({
        summary: out.summary.trim().slice(0, 600),
        impact: ctx.impact, // always ours, never the model's
        timeline: out.timeline.slice(0, 12).map(t => ({ ts: t.ts.slice(0, 8), text: t.text.slice(0, 200) })),
        automated_actions: out.automated_actions.slice(0, 20),
        likely_cause: cause.slice(0, 600),
        follow_ups: out.follow_ups.slice(0, 3).map(f => f.slice(0, 200)),
        ai_drafted: true,
      }),
    }
  } catch (err) {
    console.warn(`[agent] report via Claude failed (${describeError(err)}); using the template`)
    return fallback()
  }
}

export async function writeShiftReport(shift: db.ShiftRow): Promise<{ json: string; source: Source }> {
  const since = db.ms(shift.startedAt)
  const incidents = db.incidents().filter(i => db.ms(i.openedAt) >= since || i.status !== 'closed')
  const fallback = () => ({
    source: 'template' as const,
    json: JSON.stringify({
      summary: `${incidents.length} incident(s) this shift; ${incidents.filter(i => i.status !== 'closed').length} still open.`,
      incidents: incidents.map(i => ({ incident_id: i.incidentId.toString(), title: i.title, status: i.status, note: '' })),
      watch_next: [],
      ai_drafted: false,
    }),
  })
  if (!client || !takeBudget()) return fallback()
  try {
    const payload = {
      incidents: incidents.map(i => ({ id: i.incidentId.toString(), title: i.title, kind: i.kind, severity: i.severity, status: i.status })),
      recent_log: db.events().slice(-40).map(e => `${hhmmss(db.ms(e.at))} ${e.actor}: ${e.action} (${e.target})`),
    }
    const res = await client.beta.messages.parse(
      {
        model: config.model,
        max_tokens: 3000,
        ...FALLBACK,
        output_config: { effort: 'low', format: betaZodOutputFormat(ShiftReport) },
        system: REPORT_ROLE,
        messages: [{ role: 'user', content: `${SHIFT_TASK}\n\n<shift>${JSON.stringify(payload)}</shift>` }],
      },
      { timeout: config.llmTimeoutMs },
    )
    const out = res.parsed_output
    if (res.stop_reason === 'refusal' || !out || !out.summary.trim()) return fallback()
    return { source: 'claude', json: JSON.stringify({ ...out, watch_next: out.watch_next.slice(0, 3), ai_drafted: true }) }
  } catch (err) {
    console.warn(`[agent] shift report via Claude failed (${describeError(err)}); using the template`)
    return fallback()
  }
}
