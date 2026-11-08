import { DbConnection } from '../../packages/bindings/src/index.ts';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (m: string) => console.log(`[attacker] ${m}`);

DbConnection.builder()
  .withUri(process.env.STDB_URI ?? 'ws://127.0.0.1:3000')
  .withDatabaseName(process.env.STDB_DB ?? 'mesa')
  .onConnect(async (conn: any, identity: any) => {
    log(`connected as new identity ${identity.toHexString().slice(0, 8)}...`);
    await sleep(2000);

    log('step 1: recon, reading exposed maintenance table');
    await sleep(2000);

    log('step 2: using leaked maintenance credentials');
    await sleep(2000);

    log('step 3: calling admin_override_alarm to silence alarms');
    try { await conn.reducers.adminOverrideAlarm(); } catch (e) { log('error: ' + e); }
    try { await conn.reducers.exportOperatorTokens(); log('step 3b: also tried export_operator_tokens'); } catch (e) { log('error: ' + e); }
    await sleep(2000);

    log('step 4: pivot, trying a real reducer');
    try {
      await conn.reducers.registerOperator({ name: 'attacker' });
      log('pivot succeeded (this should NOT happen)');
    } catch (e) {
      log('pivot REJECTED, identity quarantined');
    }
    await sleep(500);
    process.exit(0);
  })
  .onConnectError((_c: any, e: any) => { console.error('connect failed:', e); process.exit(1); })
  .build();
