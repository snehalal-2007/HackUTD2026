import { t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import spacetimedb from '../schema';
import { remediationTimer } from '../tables/cluster';
import { rejectAgent } from '../lib/agent';
import { assertAllowed } from '../honeypot/guard';
import { advanceRun, migrate, setCap, startPatch } from '../lib/remediation';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// Executor reducers for the simulated cluster (docs/CLUSTER-CYCLING.md). The rules call the same
// steps automatically; these let an operator or lead act by hand. Observers and the agent cannot.
const EXECUTOR_ROLES = new Set(['operator', 'lead']);

function requireExecutor(ctx: Ctx): string {
  rejectAgent(ctx);
  assertAllowed(ctx);
  const op = ctx.db.operator.identity.find(ctx.sender);
  if (!op || !EXECUTOR_ROLES.has(op.role)) throw new SenderError('only a registered operator or lead can act on the cluster');
  return ctx.sender.toHexString().slice(0, 16);
}

/** Moves an instance and its route to another rack in one transaction. Refuses a rack that is not Ready. */
export const liveMigrateInstance = spacetimedb.reducer(
  { instanceId: t.string(), toRackId: t.string() },
  (ctx, { instanceId, toRackId }) => {
    const actor = requireExecutor(ctx);
    migrate(ctx, { instanceId, toRack: toRackId, actor, incidentId: 0n });
  }
);

/** Throttle in place: sets an instance's power cap. */
export const setPowerCap = spacetimedb.reducer(
  { instanceId: t.string(), kw: t.f64() },
  (ctx, { instanceId, kw }) => {
    const actor = requireExecutor(ctx);
    setCap(ctx, instanceId, kw, actor);
  }
);

/** Patch in place: rolls a version across a service's instances one at a time. */
export const applyPatch = spacetimedb.reducer(
  { serviceId: t.string(), version: t.string() },
  (ctx, { serviceId, version }) => {
    const actor = requireExecutor(ctx);
    startPatch(ctx, { serviceId, version, actor, incidentId: 0n, rackId: '' });
  }
);

/** Scheduled: ends a throttle's stabilization window or takes the next patch step. */
export const advanceRemediation = spacetimedb.reducer(
  { onSchedule: remediationTimer },
  { timer: remediationTimer.rowType },
  (ctx, { timer }) => {
    if (!ctx.sender.isEqual(ctx.databaseIdentity)) throw new SenderError('scheduled only');
    advanceRun(ctx, timer.runId);
  }
);
