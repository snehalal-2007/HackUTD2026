import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../schema';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

export function isAgent(ctx: Ctx): boolean {
  return !!ctx.db.agentIdentity.identity.find(ctx.sender);
}

/**
 * The agent may only call attach_report and attach_shift_report.
 * Every other state-changing reducer calls this first (docs/agents/MODULE_CONTRACT.md).
 * When the honeypot guard (assertAllowed) lands, call both.
 */
export function rejectAgent(ctx: Ctx) {
  if (isAgent(ctx)) throw new SenderError('the agent identity may only write reports');
}
