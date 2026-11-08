// Claude calls. Output is forced through a tool so it always has the report's fields.
// Every call: timeout, validation, and template fallback. Numbers come from us, not the model.
import Anthropic from '@anthropic-ai/sdk';
import { config, llmEnabled } from './config.js';
import { AGENT_ROLE, INCIDENT_TASK, INTERIM_TASK, SHIFT_TASK } from './prompts.js';
import { computeImpact, toPromptPayload } from './aggregate.js';
import { templateIncidentReport, templateShiftReport } from './template.js';
import type { Incident, IncidentContext, IncidentReport, ReportSource, ShiftReport } from './types.js';

const client = llmEnabled ? new Anthropic({ apiKey: config.apiKey }) : null;

// Simple per-minute budget so a burst of incidents cannot run up cost.
let calls = 0;
setInterval(() => (calls = 0), 60_000).unref();
const takeBudget = () => (calls < config.maxLlmCallsPerMin ? (calls++, true) : false);

const incidentTool: Anthropic.Tool = {
  name: 'submit_incident_report',
  description: 'Submit the incident report for the console.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      timeline: { type: 'array', maxItems: 12, items: { type: 'object', properties: { ts: { type: 'string' }, text: { type: 'string' } }, required: ['ts', 'text'] } },
      automated_actions: { type: 'array', items: { type: 'object', properties: {
        rule: { type: 'string' }, inputs: { type: 'string' }, migration_id: { type: ['string', 'null'] }, result: { type: 'string' } },
        required: ['rule', 'inputs', 'migration_id', 'result'] } },
      likely_cause: { type: 'string' },
      follow_ups: { type: 'array', maxItems: 3, items: { type: 'string' } },
    },
    required: ['summary', 'timeline', 'automated_actions', 'likely_cause', 'follow_ups'],
  },
};

const shiftTool: Anthropic.Tool = {
  name: 'submit_shift_report',
  description: 'Submit the shift report for the incoming operator.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      incidents: { type: 'array', items: { type: 'object', properties: {
        incident_id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' } },
        required: ['incident_id', 'title', 'status', 'note'] } },
      watch_next: { type: 'array', maxItems: 3, items: { type: 'string' } },
    },
    required: ['summary', 'incidents', 'watch_next'],
  },
};

async function callTool<T>(tool: Anthropic.Tool, task: string, wrapperTag: string, payload: unknown): Promise<T | null> {
  if (!client || !takeBudget()) return null;
  try {
    const res = await client.messages.create(
      {
        model: config.model,
        max_tokens: 1200,
        system: AGENT_ROLE,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content: `${task}\n\n<${wrapperTag}>${JSON.stringify(payload)}</${wrapperTag}>` }],
      },
      { timeout: config.llmTimeoutMs },
    );
    const block = res.content.find((b) => b.type === 'tool_use');
    return block && block.type === 'tool_use' ? (block.input as T) : null;
  } catch (err) {
    console.warn(`[agent] Claude call failed (${(err as Error).name}); using template`);
    return null;
  }
}

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function writeIncidentReport(ctx: IncidentContext, kind: 'final' | 'interim'): Promise<{ report: IncidentReport; source: ReportSource }> {
  const fallback = templateIncidentReport(ctx, kind);
  const out = await callTool<Partial<IncidentReport>>(incidentTool, kind === 'final' ? INCIDENT_TASK : INTERIM_TASK, 'incident', toPromptPayload(ctx));
  if (!out || !str(out.summary) || !Array.isArray(out.timeline)) return { report: fallback, source: 'template' };

  let cause = str(out.likely_cause);
  if (cause && !/hypothesis/i.test(cause)) cause = `Likely cause (hypothesis): ${cause}`;
  return {
    source: 'claude',
    report: {
      summary: str(out.summary),
      impact: computeImpact(ctx),                    // always ours, never the model's
      timeline: out.timeline.slice(0, 12).map((t) => ({ ts: str(t?.ts, 8), text: str(t?.text, 200) })).filter((t) => t.text),
      automated_actions: Array.isArray(out.automated_actions) && out.automated_actions.length ? out.automated_actions.slice(0, 20) : fallback.automated_actions,
      likely_cause: cause || fallback.likely_cause,
      follow_ups: (out.follow_ups ?? []).map((f) => str(f, 200)).filter(Boolean).slice(0, 3),
    },
  };
}

export async function writeShiftReport(incidents: Incident[], recentLog: string[]): Promise<{ report: ShiftReport; source: ReportSource }> {
  const fallback = templateShiftReport(incidents);
  const payload = {
    incidents: incidents.map((i) => ({ id: i.incidentId.toString(), rack: i.rackId, category: i.category, status: i.status, trigger: i.triggerRule, owner: i.owner })),
    recent_log: recentLog.slice(-40),
  };
  const out = await callTool<Partial<ShiftReport>>(shiftTool, SHIFT_TASK, 'shift', payload);
  if (!out || !str(out.summary) || !Array.isArray(out.incidents)) return { report: fallback, source: 'template' };
  return {
    source: 'claude',
    report: {
      summary: str(out.summary),
      incidents: out.incidents.slice(0, 20),
      watch_next: (out.watch_next ?? []).map((w) => str(w, 200)).filter(Boolean).slice(0, 3),
    },
  };
}
