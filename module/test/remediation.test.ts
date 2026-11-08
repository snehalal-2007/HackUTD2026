// Unit tests for in-place remediation (docs/CLUSTER-CYCLING.md).
// Run: pnpm --filter @mesa/replayer exec tsx --test ../../module/test/remediation.test.ts
// (tsx comes from the replayer package; the module itself has no runtime test dependency.)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './harness';

const { testUtils, sdk, mod, remediation: R, rules } = await loadModule();
const { createModuleTestHarness, TestAuth } = testUtils;

// ---------------------------------------------------------------------------
// Pure decisions
// ---------------------------------------------------------------------------

describe('decision order', () => {
  test('a critical incident throttles first, once', () => {
    assert.equal(R.decideOnCritical({ hasRun: false, hasInstance: true }), 'throttle_in_place');
    assert.equal(R.decideOnCritical({ hasRun: true, hasInstance: true }), 'none');
    assert.equal(R.decideOnCritical({ hasRun: false, hasInstance: false }), 'none');
  });

  test('after the window: stop, then live_migrate, then patch_in_place, then failover (approval)', () => {
    const base = { stillOver: true, hasInstance: true, target: 'dc-b/r1', knownPatch: true };
    assert.equal(R.decideAfterWindow({ ...base, stillOver: false }), 'none');
    assert.equal(R.decideAfterWindow(base), 'live_migrate');
    assert.equal(R.decideAfterWindow({ ...base, target: null }), 'patch_in_place');
    assert.equal(R.decideAfterWindow({ ...base, target: null, knownPatch: false }), 'failover_to_site');
    assert.equal(R.decideAfterWindow({ ...base, hasInstance: false }), 'none');
  });

  test('pickTarget takes the Ready rack with the most headroom and a free slot', () => {
    const rack = (rackId: string, t: number, ready = true, instances = 3, services: string[] = []) => ({
      rackId, datacenterId: rackId.split('/')[0], gpuTempMaxC: t, ready, instances, services: new Set(services),
    });
    const racks = [
      rack('dc-a/hot', 56),
      rack('dc-b/cool', 30, false), // coolest but not Ready
      rack('dc-c/full', 31, true, R.RACK_SLOTS), // no slot
      rack('dc-d/twin', 32, true, 3, ['svc']), // already runs the service
      rack('dc-e/ok', 40),
      rack('dc-f/best', 35),
    ];
    assert.equal(R.pickTarget(racks, 'dc-a/hot', 'svc', 50), 'dc-f/best');
    assert.equal(R.pickTarget([rack('dc-a/hot', 56), rack('dc-b/x', 45, false)], 'dc-a/hot', 'svc', 50), null);
  });

  test('hottestInstance skips an instance mid-patch', () => {
    const list = [
      { instanceId: 'a', demandKw: 8, state: 'patching' },
      { instanceId: 'b', demandKw: 5, state: 'running' },
      { instanceId: 'c', demandKw: 6, state: 'throttled' },
    ];
    assert.equal(R.hottestInstance(list)?.instanceId, 'c');
  });

  test('withCap scales draw and utilization with the cap', () => {
    const inst = { demandKw: 8, powerKw: 8, cpuPct: 40, gpuPct: 90 };
    const t = R.withCap(inst, 5.6);
    assert.equal(t.powerKw, 5.6);
    assert.equal(t.state, 'throttled');
    assert.equal(t.gpuPct, 63);
    const back = R.withCap(t, 10);
    assert.equal(back.powerKw, 8);
    assert.equal(back.gpuPct, 90);
    assert.equal(back.state, 'running');
  });
});

// ---------------------------------------------------------------------------
// Against the in-memory datastore
// ---------------------------------------------------------------------------

type H = ReturnType<typeof createModuleTestHarness<any>>;
const DCS = ['dc-a', 'dc-b', 'dc-c', 'dc-d', 'dc-e', 'dc-f', 'dc-g', 'dc-h'];
const RACKS = DCS.flatMap(dc => [`${dc}/r1`, `${dc}/r2`]);
const HOT = RACKS[0];

function setup(temps: Record<string, number> = {}): H {
  const h = createModuleTestHarness(mod.default, mod as any);
  tx(h, ctx => {
    rules.ensureRules(ctx);
    for (const dc of DCS) {
      ctx.db.datacenter.insert({ datacenterId: dc, name: dc, region: 'test', feed: ctx.sender, lastIngestAt: ctx.timestamp });
    }
    for (const rackId of RACKS) {
      ctx.db.rack.insert({
        rackId, datacenterId: rackId.split('/')[0], servers: 18, gpuTempMaxC: temps[rackId] ?? 40,
        cpuTempMaxC: 50, powerKw: 30, updatedAt: ctx.timestamp,
      });
    }
  });
  return h;
}

function tx<T>(h: H, body: (ctx: any) => T): T {
  return h.withReducerTx(TestAuth.internal(), body);
}

/** Sets a rack's hottest GPU and runs the incident rules for it, as one telemetry batch would. */
function batch(h: H, rackId: string, temp: number) {
  tx(h, ctx => {
    const row = ctx.db.rack.rackId.find(rackId);
    const next = { ...row, gpuTempMaxC: temp, updatedAt: ctx.timestamp };
    ctx.db.rack.rackId.update(next);
    rules.evaluateRack(ctx, next, false);
  });
}

const advance = (h: H, seconds: number) =>
  h.clock.set(new sdk.Timestamp(h.clock.now().microsSinceUnixEpoch + BigInt(seconds) * 1_000_000n));
const instances = (h: H) => [...h.db.instance.iter()] as any[];
const runs = (h: H) => [...h.db.remediationRun.iter()].sort((a: any, b: any) => Number(a.runId - b.runId)) as any[];
const events = (h: H) => [...h.db.eventLog.iter()].map((e: any) => e.action) as string[];

/** The invariant behind every step: same instances, one route each, pointing at the instance's rack. */
function assertCapacityNeutral(h: H) {
  const list = instances(h);
  assert.equal(list.length, 48, 'instance count never changes');
  assert.equal(new Set(list.map(i => i.instanceId)).size, 48, 'no instance id appears twice');
  assert.equal(Number(h.db.route.count()), 48, 'one route per instance');
  for (const i of list) assert.equal(h.db.route.instanceId.find(i.instanceId)?.target, i.rackId);
}

/** Escalates the hot rack to a critical incident (3 batches over the crit limit). */
function escalate(h: H, temp = 56) {
  for (let k = 0; k < 3; k++) batch(h, HOT, temp);
}

describe('simulated cluster', () => {
  test('seeds 24 services, 48 instances, 3 per rack, both copies in different data centers', () => {
    const h = setup();
    batch(h, RACKS[5], 40); // any evaluation seeds on first use
    assert.equal(Number(h.db.service.count()), 24);
    assertCapacityNeutral(h);
    for (const rackId of RACKS) assert.equal([...h.db.instance.rackId.filter(rackId)].length, 3);
    for (const s of h.db.service.iter() as Iterable<any>) {
      const dcs = [...h.db.instance.serviceId.filter(s.serviceId)].map((i: any) => i.datacenterId);
      assert.equal(new Set(dcs).size, 2);
    }
    assert.ok(events(h).includes('seeded simulated cluster'));
  });

  test('does not seed before every rack exists', () => {
    const h = createModuleTestHarness(mod.default, mod as any);
    tx(h, ctx => {
      rules.ensureRules(ctx);
      ctx.db.rack.insert({ rackId: 'dc-a/r1', datacenterId: 'dc-a', servers: 1, gpuTempMaxC: 40, cpuTempMaxC: 40, powerKw: 1, updatedAt: ctx.timestamp });
      assert.equal(R.ensureCluster(ctx), false);
    });
    assert.equal(Number(h.db.service.count()), 0);
  });

  test('critical incident -> throttle; still over after the window -> live_migrate to the best Ready rack', () => {
    const h = setup({ [RACKS[9]]: 30, [RACKS[11]]: 33 });
    escalate(h);
    let r = runs(h);
    assert.equal(r.length, 1);
    assert.equal(r[0].action, 'throttle_in_place');
    assert.equal(r[0].status, 'running');
    assert.ok(r[0].simulatedEffectC < 0, 'throttle shows a (simulated) cooling effect');
    const throttled = h.db.instance.instanceId.find(r[0].instanceId) as any;
    assert.equal(throttled.state, 'throttled');
    assert.equal(throttled.rackId, HOT);
    assert.equal(Number(h.db.remediationTimer.count()), 1, 'the window end is scheduled');
    assertCapacityNeutral(h);

    // More hot batches inside the window do not start a second remediation.
    batch(h, HOT, 57);
    assert.equal(runs(h).length, 1);

    advance(h, 120);
    tx(h, ctx => R.advanceRun(ctx, r[0].runId));
    r = runs(h);
    assert.deepEqual(r.map(x => [x.action, x.status]), [
      ['throttle_in_place', 'insufficient'],
      ['live_migrate', 'succeeded'],
    ]);
    const move = r[1];
    assert.equal(move.fromRack, HOT);
    const moved = h.db.instance.instanceId.find(move.instanceId) as any;
    assert.equal(moved.rackId, move.toRack);
    assert.equal(h.db.route.instanceId.find(move.instanceId)?.target, move.toRack);
    assert.equal(moved.state, 'running', 'the cap is lifted on the cool rack');
    // The coolest Ready rack wins unless it already runs a copy of the service.
    const twin = [...h.db.instance.serviceId.filter(moved.serviceId)].find((i: any) => i.instanceId !== moved.instanceId) as any;
    assert.equal(move.toRack, twin.rackId === RACKS[9] ? RACKS[11] : RACKS[9]);
    const stats = h.db.remediationStats.runId.find(move.runId) as any;
    assert.equal(stats.instancesMoved, 1);
    assert.equal(stats.duplicatesAvoided, 1);
    assert.equal(stats.downtimeS, 0);
    assertCapacityNeutral(h);
    assert.ok(events(h).includes('throttle_in_place'));
    assert.ok(events(h).includes('throttle not enough'));
    assert.ok(events(h).includes('live_migrate'));
  });

  test('throttle holds when the rack recovers within the window: no migration', () => {
    const h = setup();
    escalate(h);
    const [run] = runs(h);
    batch(h, HOT, 45);
    advance(h, 120);
    tx(h, ctx => R.advanceRun(ctx, run.runId));
    assert.deepEqual(runs(h).map(x => [x.action, x.status]), [['throttle_in_place', 'succeeded']]);
    assert.ok(events(h).includes('throttle held'));
    assertCapacityNeutral(h);
  });

  test('a held throttle is lifted when the incident closes, so repeat incidents do not ratchet the cap', () => {
    const h = setup();
    escalate(h);
    const [first] = runs(h);
    const capped = h.db.instance.instanceId.find(first.instanceId) as any;
    assert.equal(capped.autoThrottled, true);
    batch(h, HOT, 45);
    advance(h, 120);
    tx(h, ctx => R.advanceRun(ctx, first.runId));
    for (let k = 0; k < 12; k++) batch(h, HOT, 40); // successThreshold batches below warn - margin
    const lifted = h.db.instance.instanceId.find(first.instanceId) as any;
    assert.equal(lifted.autoThrottled, false);
    assert.equal(lifted.powerCapKw, R.DEFAULT_CAP_KW);
    assert.equal(lifted.state, 'running');
    assert.ok(events(h).includes('throttle lifted'));

    escalate(h); // a new incident on the same rack
    const second = runs(h).at(-1);
    assert.equal(second.action, 'throttle_in_place');
    assert.notEqual(second.runId, first.runId);
    assert.equal((h.db.instance.instanceId.find(second.instanceId) as any).powerCapKw, capped.powerCapKw);
    assertCapacityNeutral(h);
  });

  test('a cap set by hand is not lifted by the rules', () => {
    const h = setup();
    batch(h, RACKS[3], 40);
    const inst = instances(h).find(i => i.rackId === HOT);
    tx(h, ctx => R.setCap(ctx, inst.instanceId, 1, 'test'));
    batch(h, HOT, 40);
    const after = h.db.instance.instanceId.find(inst.instanceId) as any;
    assert.equal(after.powerCapKw, 1);
    assert.equal(after.state, 'throttled');
  });

  test('no Ready rack: patch_in_place if the service has a known patch, else failover waits for approval', () => {
    // Every other rack is between warn - margin and warn: not Ready, but not opening incidents either.
    const warmAll = Object.fromEntries(RACKS.slice(1).map(r => [r, 49]));

    const h = setup(warmAll);
    escalate(h);
    const [run] = runs(h);
    const hot = h.db.instance.instanceId.find(run.instanceId) as any;
    const svc = h.db.service.serviceId.find(hot.serviceId) as any;
    advance(h, 120);
    tx(h, ctx => R.advanceRun(ctx, run.runId));
    const next = runs(h)[1];
    if (svc.knownPatch) {
      assert.equal(next.action, 'patch_in_place');
      assert.equal(next.status, 'running');
    } else {
      assert.equal(next.action, 'failover_to_site');
      assert.equal(next.status, 'needs_approval');
      assert.ok(events(h).includes('failover_to_site needs approval'));
    }
    assertCapacityNeutral(h);

    // Force the other branch by giving the hot instance's service a patch (or removing it).
    const h2 = setup(warmAll);
    escalate(h2);
    const [run2] = runs(h2);
    const svcId = (h2.db.instance.instanceId.find(run2.instanceId) as any).serviceId;
    tx(h2, ctx => {
      const s = ctx.db.service.serviceId.find(svcId);
      ctx.db.service.serviceId.update({ ...s, knownPatch: svc.knownPatch ? '' : `${s.version}-p1` });
    });
    advance(h2, 120);
    tx(h2, ctx => R.advanceRun(ctx, run2.runId));
    assert.equal(runs(h2)[1].action, svc.knownPatch ? 'failover_to_site' : 'patch_in_place');
    assertCapacityNeutral(h2);
  });

  test('patch_in_place rolls one instance at a time and never adds a copy', () => {
    const h = setup();
    batch(h, RACKS[3], 40);
    tx(h, ctx => R.startPatch(ctx, { serviceId: 'inference-llm', version: 'v2.3.1', actor: 'test', incidentId: 0n, rackId: '' }));
    const run = runs(h)[0];
    assert.equal(run.steps, 2);
    for (let step = 0; step < 3; step++) {
      const svcInsts = [...h.db.instance.serviceId.filter('inference-llm')] as any[];
      assert.ok(svcInsts.filter(i => i.state === 'patching').length <= 1, 'at most one instance patching');
      assertCapacityNeutral(h);
      advance(h, 6);
      tx(h, ctx => R.advanceRun(ctx, run.runId));
    }
    const done = h.db.remediationRun.runId.find(run.runId) as any;
    assert.equal(done.status, 'succeeded');
    for (const i of h.db.instance.serviceId.filter('inference-llm') as Iterable<any>) {
      assert.equal(i.version, 'v2.3.1');
      assert.notEqual(i.state, 'patching');
    }
    const svc = h.db.service.serviceId.find('inference-llm') as any;
    assert.equal(svc.version, 'v2.3.1');
    assert.equal(svc.knownPatch, '');
    assert.equal((h.db.remediationStats.runId.find(run.runId) as any).duplicatesAvoided, 2);
    assert.ok(events(h).includes('patch_in_place finished'));
  });

  test('live_migrate refuses a rack that is not Ready and changes nothing', () => {
    const h = setup({ [RACKS[6]]: 49 });
    batch(h, RACKS[3], 40);
    const inst = instances(h).find(i => i.rackId === HOT);
    const before = JSON.stringify(instances(h).map(i => [i.instanceId, i.rackId]));
    assert.throws(() => tx(h, ctx => R.migrate(ctx, { instanceId: inst.instanceId, toRack: RACKS[6], actor: 'test', incidentId: 0n })), /not Ready/);
    assert.equal(JSON.stringify(instances(h).map(i => [i.instanceId, i.rackId])), before);
    assert.equal(runs(h).length, 0);
    assertCapacityNeutral(h);
  });
});
