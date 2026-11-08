import { t, SenderError } from 'spacetimedb/server';
import spacetimedb from '../schema';
import { isAgent } from '../lib/agent';
import { appendEvent } from '../lib/log';

const MAX_REPORT_CHARS = 20_000;
const KINDS = new Set(['final', 'interim']);
const SOURCES = new Set(['claude', 'template']);

/**
 * The agent attaches an incident report: `final` when the incident closes,
 * `interim` when it escalates. Idempotent per incident and kind.
 */
export const attachReport = spacetimedb.reducer(
  { incidentId: t.u64(), kind: t.string(), reportJson: t.string(), source: t.string() },
  (ctx, { incidentId, kind, reportJson, source }) => {
    if (!isAgent(ctx)) throw new SenderError('forbidden');
    if (!KINDS.has(kind)) throw new SenderError('bad kind');
    if (!SOURCES.has(source)) throw new SenderError('bad source');
    if (!reportJson.trim()) throw new SenderError('empty report');
    if (!ctx.db.incident.incidentId.find(incidentId)) throw new SenderError('no incident');

    for (const _existing of ctx.db.incidentReport.by_incident_kind.filter([incidentId, kind])) return;

    ctx.db.incidentReport.insert({
      reportId: 0n,
      incidentId,
      kind,
      reportJson: reportJson.slice(0, MAX_REPORT_CHARS),
      source,
      writtenAt: ctx.timestamp,
    });
    appendEvent(ctx, 'agent', `wrote ${kind} report`, `incident ${incidentId}`, incidentId);
  }
);

/** The agent attaches the shift report when a shift starts handing over. Idempotent per shift. */
export const attachShiftReport = spacetimedb.reducer(
  { shiftId: t.u64(), reportJson: t.string(), source: t.string() },
  (ctx, { shiftId, reportJson, source }) => {
    if (!isAgent(ctx)) throw new SenderError('forbidden');
    if (!SOURCES.has(source)) throw new SenderError('bad source');
    if (!reportJson.trim()) throw new SenderError('empty report');
    if (!ctx.db.shift.shiftId.find(shiftId)) throw new SenderError('no shift');
    if (ctx.db.shiftReport.shiftId.find(shiftId)) return;

    ctx.db.shiftReport.insert({
      shiftId,
      reportJson: reportJson.slice(0, MAX_REPORT_CHARS),
      source,
      writtenAt: ctx.timestamp,
    });
    appendEvent(ctx, 'agent', 'wrote shift report', `shift ${shiftId}`, null);
  }
);
