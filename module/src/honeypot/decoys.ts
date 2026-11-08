import spacetimedb from '../schema';

// Shared trap logic. Never throws: a throw would roll back the log.
function trip(ctx: any, decoy: string) {
  try {
    const caller = ctx.sender;
    const conn = ctx.connectionId ? ctx.connectionId.toHexString() : 'none';
    const existing = ctx.db.quarantine.identity.find(caller);
    let hits = 1;
    if (existing) {
      hits = existing.hits + 1;
      ctx.db.quarantine.identity.update({ ...existing, hits });
    } else {
      ctx.db.quarantine.insert({
        identity: caller,
        reason: `Called decoy ${decoy}`,
        at: ctx.timestamp,
        hits,
      });
    }
    ctx.db.threatEvent.insert({
      id: 0n,
      identity: caller,
      connectionId: conn,
      decoy,
      hitNumber: hits,
      kind: hits === 1 ? 'intrusion' : 'repeat-intrusion',
      severity: hits === 1 ? 'critical' : 'high',
      summary: `Intrusion: ${decoy} called by ${caller.toHexString().slice(0, 8)}... (hit #${hits})`,
      suggestedFix: 'Identity quarantined. Rotate maintenance credentials and review recent reads by this identity.',
      at: ctx.timestamp,
    });
  } catch (_e) {
    // swallow
  }
}

export const adminOverrideAlarm = spacetimedb.reducer({}, ctx => {
  trip(ctx, 'admin_override_alarm');
});

export const exportOperatorTokens = spacetimedb.reducer({}, ctx => {
  trip(ctx, 'export_operator_tokens');
});
