import spacetimedb from '../schema';

export const adminOverrideAlarm = spacetimedb.reducer({}, ctx => {
  try {
    if (!ctx.db.quarantine.identity.find(ctx.sender)) {
      ctx.db.quarantine.insert({
        identity: ctx.sender,
        reason: 'Called decoy admin_override_alarm',
        at: ctx.timestamp,
      });
      ctx.db.threatEvent.insert({
        id: 0n,
        identity: ctx.sender,
        kind: 'intrusion',
        severity: 'critical',
        summary: `Intrusion: unauthorized admin_override_alarm call from ${ctx.sender.toHexString().slice(0, 8)}...`,
        suggestedFix: 'Identity quarantined. Rotate maintenance credentials and review recent reads by this identity.',
        at: ctx.timestamp,
      });
    }
  } catch (_e) {
    // never throw: a throw rolls back the log
  }
});
