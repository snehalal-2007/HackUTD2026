import { SenderError } from 'spacetimedb/server';

export function assertAllowed(ctx: any) {
  if (ctx.db.quarantine.identity.find(ctx.sender)) {
    throw new SenderError('Identity quarantined: access denied');
  }
}
