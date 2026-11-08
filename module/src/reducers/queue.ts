import { t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import spacetimedb from '../schema';
import { shiftTimer } from '../tables/rules';
import { rejectAgent } from '../lib/agent';
import { appendEvent } from '../lib/log';
import { assertAllowed } from '../honeypot/guard';

// My Queue. Tasks are the active incidents the threshold rules open from alerts and risks.
//   - Starting a shift assigns you the leftovers (tasks an earlier shift didn't finish) first,
//     then tops you up to START_TASKS from the unclaimed pool, most urgent first.
//   - You can claim more yourself at any time.
//   - When you finish everything and still have time left, you're assigned TOP_UP more.
//     That happens right when you resolve your last task, and on every shift_timer tick
//     (so new incidents reach idle operators too).
//   - When a shift ends (you end it, or its time runs out), your unfinished tasks go back to the
//     pool as leftovers, marked with your name, for the next person coming in.
// Rules: only a registered operator can claim; nobody takes a task someone else owns;
// only the owner can release, reassign (to someone on shift) or resolve (a task is never resolved without an owner).

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type Incident = NonNullable<ReturnType<Ctx['db']['incident']['incidentId']['find']>>;
type Operator = NonNullable<ReturnType<Ctx['db']['operator']['identity']['find']>>;

const MAX_SHIFT_HOURS = 16;
const START_TASKS = 3; // tasks handed to someone starting a shift (leftovers can take it past this, up to MAX_LEFTOVERS)
const MAX_LEFTOVERS = 5;
const TOP_UP = 2; // more tasks for someone who finished everything with time to spare
const MIN_TIME_LEFT_MICROS = 15n * 60n * 1_000_000n; // don't hand new work to someone with under 15 min left
const TICK_MICROS = 15n * 1_000_000n;
const SEV: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SHIFTS_ACTOR = 'shifts';

const now = (ctx: Ctx) => ctx.timestamp.microsSinceUnixEpoch;
const hex = (op: Operator) => op.identity.toHexString();

export function ensureShiftTimer(ctx: Ctx) {
  if (ctx.db.shiftTimer.count() === 0n) ctx.db.shiftTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS) });
}

function me(ctx: Ctx) {
  rejectAgent(ctx);
  assertAllowed(ctx); // honeypot: quarantined identities are rejected
  const op = ctx.db.operator.identity.find(ctx.sender);
  if (!op) throw new SenderError('register as an operator first');
  return op;
}

function activeIncident(ctx: Ctx, incidentId: bigint) {
  const row = ctx.db.incident.incidentId.find(incidentId);
  if (!row) throw new SenderError('no incident');
  if (row.status === 'closed') throw new SenderError('incident is closed');
  return row;
}

/** Unowned active tasks in the order they should be handed out: leftovers, then most severe, then oldest. */
function pool(ctx: Ctx) {
  return [...ctx.db.incident.iter()]
    .filter(i => i.status !== 'closed' && !i.owner)
    .sort((a, b) =>
      Number(!a.handedFrom) - Number(!b.handedFrom) ||
      (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9) ||
      (a.openedAt.microsSinceUnixEpoch < b.openedAt.microsSinceUnixEpoch ? -1 : 1));
}

const openCount = (ctx: Ctx, id: string) => [...ctx.db.incident.iter()].filter(i => i.owner === id && i.status !== 'closed').length;

function give(ctx: Ctx, row: Incident, op: Operator, how: string) {
  const status = row.status === 'open' ? 'acknowledged' : row.status;
  ctx.db.incident.incidentId.update({ ...row, status, owner: hex(op), ownerName: op.name, claimedAtMicros: now(ctx), updatedAt: ctx.timestamp });
  appendEvent(ctx, SHIFTS_ACTOR, how, `incident ${row.incidentId} → ${op.name}${row.handedFrom ? ` (left by ${row.handedFrom})` : ''}`, row.incidentId);
}

/** An operator with no open tasks and enough shift left gets TOP_UP more. */
function topUp(ctx: Ctx, op: Operator) {
  if (!op.onShift || op.shiftEndsMicros - now(ctx) < MIN_TIME_LEFT_MICROS) return;
  if (openCount(ctx, hex(op)) > 0) return;
  for (const row of pool(ctx).slice(0, TOP_UP)) give(ctx, row, op, 'assigned more work');
}

/** Ends a shift: unfinished tasks go back to the pool as leftovers with this operator's name on them. */
function finishShift(ctx: Ctx, op: Operator, actor: string, why: string) {
  const id = hex(op);
  let left = 0;
  for (const row of [...ctx.db.incident.iter()].filter(i => i.owner === id && i.status !== 'closed')) {
    const status = row.status === 'acknowledged' ? 'open' : row.status;
    ctx.db.incident.incidentId.update({ ...row, status, owner: '', ownerName: '', claimedAtMicros: 0n, handedFrom: op.name, updatedAt: ctx.timestamp });
    left++;
  }
  ctx.db.operator.identity.update({ ...op, onShift: false, shiftStartedMicros: 0n, shiftEndsMicros: 0n });
  appendEvent(ctx, actor, 'ended shift', `${op.name} · ${why}${left ? ` · ${left} task${left === 1 ? '' : 's'} left for the next shift` : ''}`, null);
}

export const claimIncident = spacetimedb.reducer({ incidentId: t.u64() }, (ctx, { incidentId }) => {
  const op = me(ctx);
  const row = activeIncident(ctx, incidentId);
  const id = hex(op);
  if (row.owner === id) return;
  if (row.owner) throw new SenderError(`already owned by ${row.ownerName || 'another operator'}`);
  // Claiming acknowledges an open incident; an escalated one stays escalated until it's resolved.
  const status = row.status === 'open' ? 'acknowledged' : row.status;
  ctx.db.incident.incidentId.update({ ...row, status, owner: id, ownerName: op.name, claimedAtMicros: now(ctx), updatedAt: ctx.timestamp });
  appendEvent(ctx, id.slice(0, 16), 'claimed incident', `incident ${incidentId} · ${op.name}`, incidentId);
});

export const releaseIncident = spacetimedb.reducer({ incidentId: t.u64() }, (ctx, { incidentId }) => {
  const op = me(ctx);
  const row = activeIncident(ctx, incidentId);
  const id = hex(op);
  if (row.owner !== id) throw new SenderError('you do not own this incident');
  const status = row.status === 'acknowledged' ? 'open' : row.status;
  ctx.db.incident.incidentId.update({ ...row, status, owner: '', ownerName: '', claimedAtMicros: 0n, updatedAt: ctx.timestamp });
  appendEvent(ctx, id.slice(0, 16), 'released incident', `incident ${incidentId} · ${op.name}`, incidentId);
});

/** Hand a task you own to a teammate who is on shift. */
export const reassignIncident = spacetimedb.reducer({ incidentId: t.u64(), to: t.identity() }, (ctx, { incidentId, to }) => {
  const op = me(ctx);
  const row = activeIncident(ctx, incidentId);
  const id = hex(op);
  if (row.owner !== id) throw new SenderError('you can only reassign a task you own');
  const target = ctx.db.operator.identity.find(to);
  if (!target) throw new SenderError('no such operator');
  if (hex(target) === id) return;
  if (!target.onShift) throw new SenderError(`${target.name} is not on shift`);
  ctx.db.incident.incidentId.update({ ...row, owner: hex(target), ownerName: target.name, claimedAtMicros: now(ctx), handedFrom: '', updatedAt: ctx.timestamp });
  appendEvent(ctx, id.slice(0, 16), 'reassigned incident', `incident ${incidentId} · ${op.name} → ${target.name}`, incidentId);
});

export const resolveIncident = spacetimedb.reducer({ incidentId: t.u64(), note: t.string() }, (ctx, { incidentId, note }) => {
  const op = me(ctx);
  const row = activeIncident(ctx, incidentId);
  const id = hex(op);
  if (row.owner !== id) throw new SenderError('claim this incident before resolving it');
  const reason = note.trim().slice(0, 200) || `resolved by ${op.name}`;
  ctx.db.incident.incidentId.update({ ...row, status: 'closed', closedReason: reason, updatedAt: ctx.timestamp });
  appendEvent(ctx, id.slice(0, 16), 'resolved incident', `incident ${incidentId} · ${reason}`, incidentId);
  topUp(ctx, op); // finished everything with time to spare: a couple more
});

export const startMyShift = spacetimedb.reducer({ hours: t.u32() }, (ctx, { hours }) => {
  const op = me(ctx);
  if (hours < 1 || hours > MAX_SHIFT_HOURS) throw new SenderError(`a shift is 1–${MAX_SHIFT_HOURS} hours`);
  if (op.onShift) throw new SenderError('you are already on shift');
  ensureShiftTimer(ctx);
  const start = now(ctx);
  const on = { ...op, onShift: true, shiftStartedMicros: start, shiftEndsMicros: start + BigInt(hours) * 3_600_000_000n };
  ctx.db.operator.identity.update(on);
  appendEvent(ctx, hex(op).slice(0, 16), 'started shift', `${op.name} · ${hours} h`, null);
  // Coming in: take the leftovers first, then fill up to START_TASKS.
  const all = pool(ctx);
  const leftovers = all.filter(i => i.handedFrom).slice(0, MAX_LEFTOVERS);
  const fill = all.filter(i => !i.handedFrom).slice(0, Math.max(0, START_TASKS - leftovers.length));
  for (const row of leftovers) give(ctx, row, on, 'assigned leftover');
  for (const row of fill) give(ctx, row, on, 'assigned at shift start');
});

/** Ending your shift hands your unfinished tasks to the next person coming in. */
export const endMyShift = spacetimedb.reducer(ctx => {
  const op = me(ctx);
  if (!op.onShift) throw new SenderError('you are not on shift');
  finishShift(ctx, op, hex(op).slice(0, 16), 'ended by operator');
});

/** Every 15 s: end shifts whose time is up, and give idle on-shift operators more work. */
export const shiftTick = spacetimedb.reducer({ onSchedule: shiftTimer }, { timer: shiftTimer.rowType }, (ctx, _args) => {
  const t0 = now(ctx);
  for (const op of [...ctx.db.operator.iter()]) {
    if (op.onShift && op.shiftEndsMicros > 0n && op.shiftEndsMicros <= t0) finishShift(ctx, op, SHIFTS_ACTOR, 'shift time ended');
  }
  // Tasks owned by an operator who no longer exists go back to the pool.
  const ids = new Set([...ctx.db.operator.iter()].map(hex));
  for (const row of [...ctx.db.incident.iter()].filter(i => i.owner && i.status !== 'closed' && !ids.has(i.owner))) {
    const status = row.status === 'acknowledged' ? 'open' : row.status;
    ctx.db.incident.incidentId.update({ ...row, status, owner: '', ownerName: '', claimedAtMicros: 0n, updatedAt: ctx.timestamp });
  }
  for (const op of [...ctx.db.operator.iter()]) topUp(ctx, op);
});
