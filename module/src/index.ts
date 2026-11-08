import { t, SenderError } from 'spacetimedb/server';
import spacetimedb from './schema';
import { rejectAgent } from './lib/agent';

export default spacetimedb;

export { ingestReadings, pruneReadings } from './reducers/telemetry';
export { attachReport, attachShiftReport } from './reducers/reports';
export { openIncident, setIncidentStatus, startShift, setShiftStatus } from './reducers/incidents';

export const init = spacetimedb.init(_ctx => {
  // Telemetry creates data centers, racks and servers as feeds stream them in.
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
  rejectAgent(ctx);
  const trimmed = name.trim();
  if (!trimmed) throw new SenderError('name is required');
  const existing = ctx.db.operator.identity.find(ctx.sender);
  if (existing) {
    ctx.db.operator.identity.update({ ...existing, name: trimmed });
    return;
  }
  ctx.db.operator.insert({ identity: ctx.sender, name: trimmed, role: 'operator', onShift: false, online: true });
});
