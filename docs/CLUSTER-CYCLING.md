# Cluster Cycling: In-Place Remediation

When a rack runs hot, MESA sheds load **without starting a second copy of anything**. It tries in-place actions in a fixed order and stops at the first that works. The instance count is the same before and after every step. This implements `docs/SCOPE-v2.md` section 3.

## What is real and what is simulated

| Part | Source |
|---|---|
| Racks, GPU temperatures, incidents | Real: replayed OLCF Summit telemetry and the incident rules (`docs/INCIDENT-RULES.md`) |
| Services, instances, routes | **Simulated**: 24 services placed on the 16 real racks, labeled "Simulated cluster" on screen |
| Decisions, moves, patches | Real module logic, transactional, in `event_log` |
| Cooling from an action | **Modeled** (0.6 °C per kW removed) and always shown as "Simulated effect". Telemetry is recorded, so moving a service cannot change the temperatures you see |

## Decision order

| Order | Action | When | Duplicate copies |
|---|---|---|---|
| 1 | `throttle_in_place` | A rack incident becomes critical (escalates, or opens already at the crit limit). Once per incident | 0 |
| 2 | `live_migrate` | The rack is still at or over the warn limit (50 °C) when the 2-minute window ends, and a Ready rack has room | 0 |
| 3 | `patch_in_place` | Still over, no Ready rack has room, and the hot service has a known patch | 0 |
| 4 | `failover_to_site` | None of the above. Recorded as **needs approval**; nothing is started (the approval flow is roadmap) | Would be temporary |

If the rack drops below the warn limit (or its incident closes) within the window, the throttle **held** and nothing else happens. The window is the same 2 minutes the rules use to close an incident, so remediation and recovery are judged on the same clock.

### Steps in detail

- **Throttle in place.** The hottest instance on the rack (highest uncapped power demand, skipping one mid-patch) gets its power cap lowered to 70 % of its current draw. Its CPU and GPU utilization scale with it. A scheduled reducer checks the rack again after 2 minutes, so this runs with no client connected. When the rack's incident closes, the rules lift their own throttles back to the default cap, so a rack that opens several incidents in a row is throttled from full draw each time instead of ratcheting down. A cap set by hand stays until someone changes it.
- **Live migrate.** Picks the Ready rack with the most temperature headroom (warn limit minus hottest GPU), with a free slot (5 per rack), that does not already run a copy of the same service. Ties: fewer instances, then rack id. **One reducer transaction** sets `instance.rack_id` and `route.target` together, so there is never a moment with two copies or with none. The cap returns to the default (10 kW) on the cool rack.
- **Patch in place.** Rolls a version across a service's instances one at a time (one step every 6 s): at most one instance is `patching` at any moment, none restarts, none is duplicated. When the last one finishes, `service.version` updates and the known patch clears.
- **Ready** means: no active incident on the rack, its probe level is ok, its hottest GPU is below warn minus the clear margin (48 °C), and its data center's feed is not stale. The console uses the same rule for its Ready badge.

## Metrics

| Metric | Meaning |
|---|---|
| Instances | Total instance rows. It never changes |
| Instances moved | Live migrations |
| Duplicates avoided | Copies the duplicate-and-failover alternative would have started: 1 per live migration, 1 per instance patched (a blue-green rollout starts one new copy per instance). A throttle moves nothing, so it counts 0 |
| Downtime | Always 0 s: no step stops an instance |
| Warning lead time | Seconds from the incident opening at the warn limit to remediation starting at the crit limit |

## Data model (module)

`module/src/tables/cluster.ts`. All new tables, so existing databases (including Maincloud) migrate without a reset.

| Table | Public | Key fields |
|---|---|---|
| `service` | Yes | `service_id`, `tier`, `version`, `known_patch` |
| `instance` | Yes | `instance_id`, `service_id`, `rack_id` (changes on live migration), `state` (running, throttled, patching), `auto_throttled`, `demand_kw`, `power_cap_kw`, `power_kw`, `cpu_pct`, `gpu_pct`, `version` |
| `route` | Yes | `instance_id`, `service_id`, `target` (rack id; moves with the instance) |
| `remediation_run` | Yes | `run_id`, `incident_id` (0 if by hand), `rack_id`, `action`, `status` (running, succeeded, insufficient, needs_approval, failed), `actor`, `instance_id`, `from_rack`, `to_rack`, `version`, `detail`, `step`/`steps`, `simulated_effect_c`, `started_at`, `decide_at`, `finished_at` |
| `remediation_stats` | Yes | `run_id`, `instances_moved`, `duplicates_avoided`, `downtime_s`, `lead_time_s` |
| `remediation_timer` | No | Schedules the end of a throttle window and each patch step |

**Seeding.** The cluster seeds itself on first use: the first rack evaluation after all 16 racks exist inserts 24 services with two instances each (48 instances, 3 per rack). Both copies of a service land in different data centers. Load values are deterministic per instance id.

### Reducers

| Reducer | Caller | Purpose |
|---|---|---|
| `live_migrate_instance(instance_id, to_rack_id)` | Operator or lead | Moves an instance and its route in one transaction. Refuses a rack that is not Ready, is full, or already runs the service |
| `set_power_cap(instance_id, kw)` | Operator or lead | Throttle (or unthrottle) by hand, 0.5 to 20 kW |
| `apply_patch(service_id, version)` | Operator or lead | Starts a rolling in-place patch |
| `advance_remediation` | Scheduler only | Ends a throttle window or takes the next patch step |

All three executor reducers reject the agent identity and quarantined identities, and require a registered operator with role `operator` or `lead`. The automatic path runs inside `ingest_readings` (one call from `evaluateRack` in `module/src/lib/rules.ts`) and the scheduled reducer, with actor `remediation`. Every step appends to the hash-chained `event_log`.

## Console: Cluster view

**Cluster** in the sidebar (Operations, under Floor).

- **Totals:** instances (constant), instances moved, duplicates avoided, downtime, active runs.
- **Services per rack:** one card per rack with its live status (Ready, Not Ready: warm, Incident, Feed silent; color, icon and text), hottest GPU from telemetry, slots used, and its instances with draw and a Throttled or Patching badge.
- **Remediation runs:** newest first. Action, status, instance, from → to, a countdown while a throttle window is open, patch progress, whether it was automatic, the incident, "Simulated effect", duplicates avoided, downtime and warning lead time.
- **Services:** version and placement; a **Patch to vX** button when a known patch exists (needs a registered operator).

## Testing

Unit tests run the module in SpacetimeDB's in-memory test harness (`spacetimedb/server/test-utils`) under Node, with no extra dependency:

```bash
pnpm --filter @mesa/replayer exec tsx --test ../../module/test/remediation.test.ts
```

They cover the decision order, target choice (headroom, Ready, slots, anti-affinity), the full escalate → throttle → window → live-migrate path, a throttle that holds and is lifted when the incident closes (so repeat incidents do not ratchet the cap), a cap set by hand surviving, the patch-or-failover branch when no rack is Ready, a rolling patch, and a refused migration. After every step they assert 48 instances, unique ids, one route per instance and `route.target == instance.rack_id`.

Live, on a local database:

```bash
SPACETIME_DB=mesa-cluster pnpm publish:local
SPACETIME_DB=mesa-cluster pnpm replay -- --speed 10 --feed cluster
cd apps/console && VITE_SPACETIME_URI=ws://localhost:3000 VITE_SPACETIME_DB=mesa-cluster pnpm exec vite --port 5176
```

In one replay, three racks went critical within the first minutes. Two were still over 55 °C after the window and live-migrated their hottest instance (`cart-2`, `inventory-2`) to the coolest Ready rack; the third dropped to 45 °C and the throttle held. A hand-started patch rolled `inference-llm` to v2.3.1 one instance at a time. The instance count stayed 48 and every route matched its instance's rack throughout.

## Roadmap

- Real live migration (CRIU checkpoint/restore, or VM live migration) behind the same reducer contract.
- An approval flow for `failover_to_site`.
