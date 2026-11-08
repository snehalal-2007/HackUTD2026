import { assertAllowed } from './honeypot/guard';
export * from './honeypot/decoys';
import { t, SenderError } from 'spacetimedb/server';
import spacetimedb from './schema';

export default spacetimedb;

export const init = spacetimedb.init(_ctx => {
  // Phase 1: seed the hall (assets) here.
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const row = ctx.db.operator.identity.find(ctx.sender);
  if (row) ctx.db.operator.identity.update({ ...row, online: true });
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const row = ctx.db.operator.identity.find(ctx.sender);
  if (row) ctx.db.operator.identity.update({ ...row, online: false });
});

export const registerOperator = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const trimmed = name.trim();
  if (!trimmed) throw new SenderError('name is required');
  const existing = ctx.db.operator.identity.find(ctx.sender);
  if (existing) {
    ctx.db.operator.identity.update({ ...existing, name: trimmed });
    return;
  }
  ctx.db.operator.insert({ identity: ctx.sender, name: trimmed, role: 'operator', onShift: false, online: true });
});
