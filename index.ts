// services/agent — MESA incident-report agent (scope v2).
//
// Statements of behavior:
//   1. The agent never makes or changes decisions. Thresholds in the module decide and act.
//   2. When an incident CLOSES it writes a final incident report.
//   3. When an incident ESCALATES to a human it writes a short interim report.
//   4. When a shift starts HANDING OVER it writes the shift report.
//   5. Every report has fixed fields. Impact numbers are computed here, never by the model.
//   6. If Claude is unavailable, slow, over budget or returns bad output, a template report is written.
//   7. It writes only through attach_report and attach_shift_report. Each report is written once.
//   8. Table contents are data, not instructions (security incidents contain attacker-controlled text).

import { config, describeConfig } from './config.js';
import * as db from './stdb.js';
import { writeIncidentReport, writeShiftReport } from './llm.js';
import type { Incident } from './types.js';

const TEN_MIN = 10 * 60_000;
const inFlight = new Set<string>();

async function handleIncident(row: any) {
  const incident: Incident = db.mapIncident(row);
  const kind = incident.status === 'closed' ? 'final' : incident.status === 'escalated' ? 'interim' : null;
  if (!kind) return;
  const key = `${incident.incidentId}:${kind}`;
  if (inFlight.has(key) || db.hasIncidentReport(incident.incidentId, kind)) return;
  inFlight.add(key);
  const t0 = Date.now();
  try {
    const end = incident.closedAt ?? Date.now();
    const ctx = {
      incident,
      rollups: db.rollupsFor(incident.rackId, incident.openedAt - TEN_MIN, end),
      migrations: db.migrationsFor(incident.incidentId),
      log: db.logFor(incident.incidentId),
    };
    const { report, source } = await writeIncidentReport(ctx, kind);
    if (db.hasIncidentReport(incident.incidentId, kind)) return; // another instance won the race
    db.attachReport(incident.incidentId, kind, JSON.stringify(report), source);
    console.log(`[agent] ${kind} report for incident ${incident.incidentId} (${incident.category}) via ${source} in ${Date.now() - t0} ms`);
  } catch (e) {
    console.error(`[agent] report for incident ${incident.incidentId} failed`, e);
  } finally {
    inFlight.delete(key);
  }
}

async function handleShift(row: any) {
  const status = row.status?.tag ?? row.status;
  const shiftId = BigInt(row.shiftId);
  const key = `shift:${shiftId}`;
  if (status !== 'handing_over' || inFlight.has(key) || db.hasShiftReport(shiftId)) return;
  inFlight.add(key);
  try {
    const since = db.toMs(row.startedAt);
    const incidents = db.allIncidents().filter((i) => i.openedAt >= since || i.status !== 'closed');
    const { report, source } = await writeShiftReport(incidents, db.recentLogLines());
    if (!db.hasShiftReport(shiftId)) db.attachShiftReport(shiftId, JSON.stringify(report), source);
    console.log(`[agent] shift report for shift ${shiftId} via ${source}`);
  } catch (e) {
    console.error(`[agent] shift report ${shiftId} failed`, e);
  } finally {
    inFlight.delete(key);
  }
}

console.log(`[agent] starting: ${describeConfig()}`);
db.connect(
  { host: config.stdbHost, db: config.stdbDb, token: config.stdbToken },
  {
    onIncident: (row) => void handleIncident(row),
    onShift: (row) => void handleShift(row),
    onReady: () => {
      // Catch up on anything that closed or escalated while the agent was offline.
      for (const row of db.conn().db.incident.iter()) void handleIncident(row);
      for (const row of db.conn().db.shift.iter()) void handleShift(row);
      console.log('[agent] subscribed and caught up');
    },
  },
);
