import type { ActionItem, ShiftIncident, ShiftReportData, TempPoint } from './types'

// SAMPLE SHIFTS: clearly labeled fixtures, not live data.
//
// The replayed telemetry covers about 60 minutes and the database keeps no history of past shifts, so three
// earlier shifts cannot be read from it. These three are written by hand so the report can be shown, switched
// and printed end to end. Every number, rack and machine name below is made up for illustration. The console
// labels each one "Sample shift (illustrative)" on screen and in the PDF, and the cost figures are computed from
// these counts with the same model as the live report. Nothing here is ever presented as live.

export const SAMPLE_LABEL = 'Sample shift (illustrative)'

/** Hottest GPU every 30 minutes of a 12-hour shift: 25 points. */
function series(values: number[]): TempPoint[] {
  return values.map((tempC, i) => ({ min: i * 30, tempC }))
}

function inc(partial: Omit<ShiftIncident, 'needsHuman'> & { needsHuman?: boolean }): ShiftIncident {
  return { needsHuman: false, ...partial }
}

function act(partial: Omit<ActionItem, 'illustrative'>): ActionItem {
  return { illustrative: true, ...partial }
}

const SAMPLE_CAVEAT = 'Every figure on this page is made up for illustration. It is not read from the database.'

// ---------------------------------------------------------------------------
// Last night: a busy night with one problem that needs a person
// ---------------------------------------------------------------------------
const lastNight: ShiftReportData = {
  id: 'sample-last-night',
  kind: 'sample',
  tabLabel: 'Last night',
  title: 'Last night’s shift',
  windowLabel: '19:00 to 07:00',
  startClock: '19:00',
  durationMin: 720,
  incidents: [
    inc({ id: 'S1-1', title: 'GPU too hot', kind: 'gpu_temp', severity: 'critical', place: 'Spartanburg · a18', openedMin: 95, closedMin: 131, status: 'closed', peakC: 56.2, mesaDid: 'Lowered the power cap, then moved 1 running instance to rack a03. No downtime.' }),
    inc({ id: 'S1-2', title: 'GPU too hot', kind: 'gpu_temp', severity: 'high', place: 'Dallas · site7 b12', openedMin: 210, closedMin: 244, status: 'closed', peakC: 53.1, mesaDid: 'Lowered the power cap. The temperature fell inside the 2-minute window, so nothing had to move.' }),
    inc({ id: 'S1-3', title: 'GPU too hot', kind: 'gpu_temp', severity: 'critical', place: 'North Carolina · c04', openedMin: 330, closedMin: 371, status: 'closed', peakC: 57.0, mesaDid: 'Lowered the power cap, then moved 2 running instances to cooler racks. No downtime.' }),
    inc({ id: 'S1-4', title: 'Data feed silent', kind: 'feed_stale', severity: 'medium', place: 'Dallas · feed', openedMin: 402, closedMin: 409, status: 'closed', peakC: null, mesaDid: 'The watchdog flagged the silent feed. It came back by itself after 7 minutes.' }),
    inc({ id: 'S1-5', title: 'GPU fault', kind: 'gpu_failure', severity: 'high', place: 'Spartanburg · a07 server 11', openedMin: 560, closedMin: null, status: 'escalated', peakC: null, mesaDid: 'Raised the alert and escalated it. A failed GPU needs a person to look at the hardware.', needsHuman: true }),
    inc({ id: 'S1-6', title: 'GPU too hot', kind: 'gpu_temp', severity: 'high', place: 'Spartanburg · a18', openedMin: 640, closedMin: 668, status: 'closed', peakC: 54.4, mesaDid: 'Lowered the power cap, then moved 1 running instance to rack a03. No downtime.' }),
  ],
  remediation: { instancesMoved: 4, duplicatesAvoided: 4, downtimeS: 0, leadTimeS: 780, throttles: 4, migrations: 4, patches: 0, needsApproval: 0 },
  hottest: series([46, 46.5, 47.5, 56.2, 51, 48, 47.5, 53.1, 50, 48, 47.5, 57.0, 52, 49, 48, 47.5, 47, 47, 47.5, 48, 49, 54.4, 51, 48.5, 47.5]),
  provenance: SAMPLE_CAVEAT,
  moments: [
    { min: 95, text: 'Rack a18 went critical at 56.2 °C. MESA lowered its power cap.', tone: 'warn' },
    { min: 131, text: 'a18 cooled after one instance moved to rack a03.', tone: 'ok' },
    { min: 330, text: 'Rack c04 in North Carolina reached 57.0 °C. Two instances moved.', tone: 'warn' },
    { min: 402, text: 'Dallas feed went silent for 7 minutes, then recovered.', tone: 'info' },
    { min: 560, text: 'A GPU fault on a07 server 11 was escalated. Still open.', tone: 'bad' },
    { min: 640, text: 'a18 got hot again and was handled the same way.', tone: 'warn' },
  ],
  actions: [
    act({ id: 'S1-A1', what: 'Replace the failed GPU', where: 'Spartanburg · a07 server 11', why: 'The GPU fault from 04:20 is still open. The server stays out of service until it is replaced.', priority: 'high', role: 'Facilities technician' }),
    act({ id: 'S1-A2', what: 'Check temperatures and airflow', where: 'Spartanburg · rack a18', why: 'Rack a18 went over the limit twice in one night. Two heat events on one rack point to a cooling problem.', priority: 'high', role: 'Operator' }),
    act({ id: 'S1-A3', what: 'Order replacement fans', where: 'Spartanburg · rack a18', why: 'Two fans on a18 were running at their maximum all night.', priority: 'medium', role: 'Lead' }),
    act({ id: 'S1-A4', what: 'Upgrade RAM', where: 'Dallas · machine site7-b12-n03', why: 'It ran at 94% memory use while it was hot, which kept the CPU busy longer.', priority: 'low', role: 'Facilities technician' }),
  ],
  aiBrief: null,
  caveats: [SAMPLE_CAVEAT],
}

// ---------------------------------------------------------------------------
// The night before: a quiet night
// ---------------------------------------------------------------------------
const nightBefore: ShiftReportData = {
  id: 'sample-night-before',
  kind: 'sample',
  tabLabel: 'The night before',
  title: 'The night before last',
  windowLabel: '19:00 to 07:00',
  startClock: '19:00',
  durationMin: 720,
  incidents: [
    inc({ id: 'S2-1', title: 'GPU too hot', kind: 'gpu_temp', severity: 'medium', place: 'Spartanburg · a03', openedMin: 300, closedMin: 330, status: 'closed', peakC: 51.4, mesaDid: 'Lowered the power cap. The temperature turned inside the 2-minute window, so nothing had to move.' }),
    inc({ id: 'S2-2', title: 'Data feed silent', kind: 'feed_stale', severity: 'low', place: 'North Carolina · feed', openedMin: 505, closedMin: 512, status: 'closed', peakC: null, mesaDid: 'The watchdog flagged the silent feed. It came back by itself after 7 minutes.' }),
  ],
  remediation: { instancesMoved: 0, duplicatesAvoided: 4, downtimeS: 0, leadTimeS: 900, throttles: 1, migrations: 0, patches: 1, needsApproval: 0 },
  hottest: series([45, 45.5, 46, 46, 46.5, 47, 47, 47.5, 48, 49, 51.4, 49.5, 48.5, 48, 47.5, 47, 47, 46.5, 46, 46, 45.5, 45.5, 45, 45, 44.5]),
  provenance: SAMPLE_CAVEAT,
  moments: [
    { min: 300, text: 'Rack a03 reached 51.4 °C. MESA lowered its power cap and it cooled.', tone: 'warn' },
    { min: 420, text: 'MESA patched the “edge-gateway” service on 4 instances, one at a time, without a restart.', tone: 'ok' },
    { min: 505, text: 'North Carolina feed went silent for 7 minutes, then recovered.', tone: 'info' },
  ],
  actions: [
    act({ id: 'S2-A1', what: 'Check the network link', where: 'North Carolina · data feed', why: 'The feed dropped once for 7 minutes. A second drop would point to a failing link.', priority: 'medium', role: 'Operator' }),
    act({ id: 'S2-A2', what: 'Review the power cap on rack a03', where: 'Spartanburg · rack a03', why: 'The cap was lowered during the night and lifted again. Confirm it is back at its normal value.', priority: 'low', role: 'Lead' }),
  ],
  aiBrief: null,
  caveats: [SAMPLE_CAVEAT],
}

// ---------------------------------------------------------------------------
// A week ago: a heavy night with a failover that needed approval
// ---------------------------------------------------------------------------
const weekAgo: ShiftReportData = {
  id: 'sample-week-ago',
  kind: 'sample',
  tabLabel: 'A week ago',
  title: 'The shift a week ago',
  windowLabel: '19:00 to 07:00',
  startClock: '19:00',
  durationMin: 720,
  incidents: [
    inc({ id: 'S3-1', title: 'GPU too hot', kind: 'gpu_temp', severity: 'critical', place: 'Spartanburg · a18', openedMin: 60, closedMin: 104, status: 'closed', peakC: 58.3, mesaDid: 'Lowered the power cap, then moved 2 instances to rack a03. No downtime.' }),
    inc({ id: 'S3-2', title: 'GPU too hot', kind: 'gpu_temp', severity: 'critical', place: 'Spartanburg · a07', openedMin: 130, closedMin: 188, status: 'closed', peakC: 57.6, mesaDid: 'Lowered the power cap, then moved 2 instances. No downtime.' }),
    inc({ id: 'S3-3', title: 'GPU too hot', kind: 'gpu_temp', severity: 'high', place: 'Dallas · site8 a02', openedMin: 240, closedMin: 281, status: 'closed', peakC: 54.0, mesaDid: 'Lowered the power cap, then moved 1 instance.' }),
    inc({ id: 'S3-4', title: 'GPU too hot', kind: 'gpu_temp', severity: 'critical', place: 'North Carolina · c04', openedMin: 330, closedMin: 402, status: 'closed', peakC: 59.1, mesaDid: 'Cooler racks were full, so no safe move existed. MESA asked a lead to approve a failover to another site. The lead approved it.', needsHuman: true }),
    inc({ id: 'S3-5', title: 'Data feed silent', kind: 'feed_stale', severity: 'high', place: 'Dallas · feed', openedMin: 440, closedMin: 462, status: 'closed', peakC: null, mesaDid: 'The watchdog flagged the silent feed. It came back after 22 minutes.' }),
    inc({ id: 'S3-6', title: 'GPU too hot', kind: 'gpu_temp', severity: 'medium', place: 'Spartanburg · a18', openedMin: 520, closedMin: 548, status: 'closed', peakC: 52.0, mesaDid: 'Lowered the power cap. No move needed.' }),
    inc({ id: 'S3-7', title: 'GPU too hot', kind: 'gpu_temp', severity: 'high', place: 'North Carolina · c04', openedMin: 590, closedMin: 631, status: 'closed', peakC: 55.4, mesaDid: 'Lowered the power cap, then moved 1 instance.' }),
    inc({ id: 'S3-8', title: 'Raised by hand', kind: 'manual', severity: 'low', place: 'Spartanburg · hall 2', openedMin: 660, closedMin: 690, status: 'closed', peakC: null, mesaDid: 'An operator opened it after hearing a fan alarm. No rule was involved.', needsHuman: true }),
  ],
  remediation: { instancesMoved: 6, duplicatesAvoided: 10, downtimeS: 0, leadTimeS: 660, throttles: 6, migrations: 6, patches: 1, needsApproval: 1 },
  hottest: series([47, 49, 58.3, 52, 57.6, 51, 49, 50, 54.0, 51, 50, 59.1, 56, 52, 50, 50, 51, 52.0, 51, 55.4, 52, 50, 49, 49, 48]),
  provenance: SAMPLE_CAVEAT,
  moments: [
    { min: 60, text: 'Rack a18 reached 58.3 °C. Two instances moved to a03.', tone: 'warn' },
    { min: 330, text: 'Rack c04 hit 59.1 °C and no safe rack was free. A lead approved a failover.', tone: 'bad' },
    { min: 440, text: 'Dallas feed went silent for 22 minutes.', tone: 'info' },
    { min: 480, text: 'MESA patched the “billing-api” service on 4 instances in place.', tone: 'ok' },
    { min: 660, text: 'An operator raised a fan alarm by hand.', tone: 'info' },
  ],
  actions: [
    act({ id: 'S3-A1', what: 'Add capacity or free up racks', where: 'North Carolina · site', why: 'Rack c04 ran out of cool racks to move to. A failover was the only option and it needs a lead each time.', priority: 'high', role: 'Lead' }),
    act({ id: 'S3-A2', what: 'Replace a noisy fan', where: 'Spartanburg · hall 2', why: 'An operator raised a fan alarm. Nothing in telemetry explains it, so it needs a physical check.', priority: 'medium', role: 'Facilities technician' }),
    act({ id: 'S3-A3', what: 'Upgrade RAM', where: 'North Carolina · machine c04-n09', why: 'It hit its memory limit three times during hot periods.', priority: 'low', role: 'Facilities technician' }),
  ],
  aiBrief: null,
  caveats: [SAMPLE_CAVEAT],
}

export const SAMPLE_SHIFTS: ShiftReportData[] = [lastNight, nightBefore, weekAgo]
