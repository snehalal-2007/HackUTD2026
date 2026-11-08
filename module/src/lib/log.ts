import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../schema';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const GENESIS = '0'.repeat(16);

// 64-bit FNV-1a, deterministic and dependency-free (modules have no crypto library).
// Enough for tamper evidence in the demo; swap for SHA-256 if one becomes available.
function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

function lastHash(ctx: Ctx): string {
  let last: { seq: bigint; hash: string } | undefined;
  for (const row of ctx.db.eventLog.iter()) {
    if (!last || row.seq > last.seq) last = row;
  }
  return last ? last.hash : GENESIS;
}

/** Appends one hash-chained row to event_log. Every state-changing reducer calls this. */
export function appendEvent(
  ctx: Ctx,
  actor: string,
  action: string,
  target: string,
  incidentId: bigint | null,
) {
  const prevHash = lastHash(ctx);
  const at = ctx.timestamp;
  const hash = fnv1a64(
    [prevHash, at.microsSinceUnixEpoch.toString(), actor, action, target, incidentId?.toString() ?? ''].join('|'),
  );
  ctx.db.eventLog.insert({
    seq: 0n,
    at,
    actor,
    action,
    target,
    incidentId: incidentId ?? undefined,
    prevHash,
    hash,
  });
}
