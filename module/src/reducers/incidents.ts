import { t, SenderError } from 'spacetimedb/server';
import spacetimedb from '../schema';
import { rejectAgent } from '../lib/agent';
import { appendEvent } from '../lib/log';

// Minimal incident and shift lifecycle so the agent has status changes to report on
// (docs/agents/MODULE_CONTRACT.md). The module owner extends these with owners,
// deadlines, escalation timers and handoff items; the agent never calls them.

const INCIDENT_STATUSES = new Set(['open', 'acknowledged', 'escalated', 'closed']);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const SHIFT_STATUSES = new Set(['active', 'handing_over', 'closed']);

export const openIncident = spacetimedb.reducer(
  { title: t.string(), severity: t.string(), datacenterId: t.string() },
  (ctx, { title, severity, datacenterId }) => {
    rejectAgent(ctx);
    if (!title.trim()) throw new SenderError('title is required');
    if (!SEVERITIES.has(severity)) throw new SenderError('bad severity');
    const row = ctx.db.incident.insert({
      incidentId: 0n,
      status: 'open',
      title: title.trim(),
      severity,
      datacenterId,
      openedAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    appendEvent(ctx, ctx.sender.toHexString().slice(0, 16), 'opened incident', title.trim(), row.incidentId);
  }
);

export const setIncidentStatus = spacetimedb.reducer(
  { incidentId: t.u64(), status: t.string() },
  (ctx, { incidentId, status }) => {
    rejectAgent(ctx);
    if (!INCIDENT_STATUSES.has(status)) throw new SenderError('bad status');
    const row = ctx.db.incident.incidentId.find(incidentId);
    if (!row) throw new SenderError('no incident');
    if (row.status === 'closed') throw new SenderError('incident is closed');
    if (row.status === status) return;
    ctx.db.incident.incidentId.update({ ...row, status, updatedAt: ctx.timestamp });
    appendEvent(ctx, ctx.sender.toHexString().slice(0, 16), `set incident ${status}`, `incident ${incidentId}`, incidentId);
  }
);

export const startShift = spacetimedb.reducer(ctx => {
  rejectAgent(ctx);
  const row = ctx.db.shift.insert({ shiftId: 0n, status: 'active', startedAt: ctx.timestamp });
  appendEvent(ctx, ctx.sender.toHexString().slice(0, 16), 'started shift', `shift ${row.shiftId}`, null);
});

export const setShiftStatus = spacetimedb.reducer(
  { shiftId: t.u64(), status: t.string() },
  (ctx, { shiftId, status }) => {
    rejectAgent(ctx);
    if (!SHIFT_STATUSES.has(status)) throw new SenderError('bad status');
    const row = ctx.db.shift.shiftId.find(shiftId);
    if (!row) throw new SenderError('no shift');
    if (row.status === 'closed') throw new SenderError('shift is closed');
    if (row.status === status) return;
    ctx.db.shift.shiftId.update({ ...row, status });
    appendEvent(ctx, ctx.sender.toHexString().slice(0, 16), `set shift ${status}`, `shift ${shiftId}`, null);
  }
);
