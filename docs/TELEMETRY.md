# Telemetry Streaming

MESA streams real data-center telemetry into SpacetimeDB from eight data centers at once. No public source publishes live rack-level telemetry (operators keep it private), so MESA **replays real recorded telemetry** from the OLCF Summit supercomputer with timestamps shifted to now. To SpacetimeDB and every client, it arrives exactly like a live feed.

## Data source

| | |
|---|---|
| Dataset | [ClusterWise](https://huggingface.co/datasets/MachaParfait/ClusterWise): OLCF Summit telemetry (Oak Ridge National Laboratory) |
| License | CC BY 4.0. Credit the dataset wherever the data is shown |
| Sample in repo | `services/replayer/data/summit-sample.csv.gz` (2.3 MB): 1 hour from 2020-01-06 16:59 UTC, 288 servers in 16 cabinets, a sample about every 10 s, 100,674 rows |
| Regenerate or change | `services/replayer/scripts/extract_summit.py` reads only the needed columns and rows over HTTPS with DuckDB (no full download) |

### Measured versus derived

| Field | Unit | Kind | From |
|---|---|---|---|
| `gpu_temp_c` | °C | Measured | Hottest of the node's 6 V100 GPU cores |
| `cpu_temp_c` | °C | Measured | Hotter of the node's 2 Power9 CPUs (max core) |
| `gpu_power_w` | W | Measured | Sum of 6 GPUs |
| `cpu_power_w` | W | Measured | Sum of 2 CPUs |
| `node_power_w` | W | Measured | Sum of both power supplies' AC input |
| `node_state`, `job_active`, `gpu_failure` | | Measured | Node state, a job allocated, GPU failure event |
| `gpu_util_pct` | % | **Derived** | GPU power ÷ (6 × 300 W rated). The dataset has no utilization counters |
| `cpu_util_pct` | % | **Derived** | CPU power ÷ (2 × 250 W rated) |
| `region`, `datacenter_id`, `rack_id`, `server_id` | | **Assigned** | Summit is one site; MESA assigns its cabinets to eight data centers (below) |

The dataset has no rack inlet temperature, so MESA does not show one.

### Mapping to MESA

Summit hostnames encode position: `<cabinet column a-h><cabinet row>n<node 1-18 from bottom>`. Each cabinet becomes a rack, and each node a server. The 16 cabinets with the most GPU temperature movement in the hour are spread across eight data centers, two racks each:

| Data center | Region | Racks (Summit cabinets) |
|---|---|---|
| `dc-spartanburg` (Spartanburg) | us-southeast | a18, a19 |
| `dc-north-carolina` (North Carolina) | us-southeast | a17, c28 |
| `dc-site-3` | us-east | c35, h33 |
| `dc-site-4` | us-east | c34, a03 |
| `dc-site-5` | us-central | c36, d04 |
| `dc-site-6` | us-central | b24, c29 |
| `dc-site-7` | us-west | b17, e09 |
| `dc-site-8` | us-west | b19, c33 |

IDs are `dc-spartanburg/a18` (rack) and `dc-spartanburg/a18n05` (server); `source_hostname` keeps the original Summit name.

## Database (module)

| Table | Holds |
|---|---|
| `datacenter` | One row per data center, with the identity (`feed`) allowed to stream it |
| `rack` | Per-rack aggregates refreshed every batch: servers, max GPU and CPU temperature, total kW |
| `server` | One row per server, with rack, data center, region and source hostname |
| `server_latest` | The newest reading per server. **Subscribe to this for live views** |
| `server_reading` | Rolling 15-minute history for trends; pruned every minute by `prune_readings` |

`ingest_readings(datacenterId, readings[])` accepts up to 1,000 readings for one data center:

- The first identity to stream a data center becomes its feed; any other identity is rejected.
- Every reading's rack and server must belong to that data center.
- Non-numeric values are rejected.
- A reading whose `seq` is not newer than the server's latest is ignored (duplicates and resends).
- Unknown racks and servers are created on first sight.

## Run it

```bash
pnpm dev:db                                  # local SpacetimeDB
pnpm publish:local                           # publish the module and regenerate bindings
pnpm replay                                  # stream all 8 data centers in real time (forever)
pnpm replay -- --speed 10                    # 10x: the hour plays in 6 minutes
pnpm replay -- --sites dc-spartanburg,dc-north-carolina --feed us-southeast
```

| Flag | Default | Meaning |
|---|---|---|
| `--speed` | `REPLAY_SPEED`, else `1` | 1 = real time (one batch per data center about every 10 s); 4 = every 2.5 s |
| `--sites` | all | Comma-separated data center IDs to stream |
| `--loops` | `0` | Times to play the hour; 0 = forever, timestamps keep moving forward |
| `--feed` | `all` | Name of the stored identity. Run one process per site with different `--feed` names to model separate facilities |
| `--file` | the sample | Another extracted CSV |

Each feed's identity token is saved in `.replayer-tokens.json` at the repo root (git-ignored), so it keeps ownership of its data centers across restarts. Set `REPLAYER_TOKEN` to use a specific identity instead (for example on Railway).

Point it at Maincloud with `SPACETIME_URI=wss://maincloud.spacetimedb.com` and `SPACETIME_DB=hackutd2026-0nef9`, after the release manager publishes this module there.

Readings are stamped with the wall-clock time they are sent, so at any speed they arrive as "now". A faster speed compresses the recorded hour: at 4× it plays in about 15 minutes and loops.

### Speed on Railway

The Railway replayer reads `REPLAY_SPEED` (default `1`). At `4` each data center sends a batch every 2.5 s, so temperature incidents open and close four times as often:

| Speed | Batch every | Rack temperature incidents | Recorded hour plays in |
|---|---|---|---|
| 1 | 10 s | about 4 an hour, plus 2 racks that stay open | 59 min |
| 4 | 2.5 s | about 16 an hour (one every ~4 min) | 15 min |

Rules count batches, not seconds, so at 4× an incident opens after about 7.5 s over the limit and closes after about 30 s under it. The recording has one 90-second gap (at 17:05 in the source data). At 1× that silence trips the feed watchdog and opens 8 `feed_stale` incidents every loop; at 4× the gap is 22.5 s, under the 30 s limit, so those no longer appear. Stop a feed to show the watchdog instead.

**Maincloud budget:** at 1× the replay sends about 29 readings per second in 8 batches every 10 s; at 4× about 115 per second in 8 batches every 2.5 s. Keep higher speeds local.

## Tested

- One full hour at 60×: 100,674 readings in 8 data centers, 0 failed batches; 8 data centers, 16 racks, 288 servers and 288 latest rows created.
- A second identity streaming `dc-site-3` was rejected ("streamed by another feed").
- A resent reading with the same `seq` and an older one were ignored; only the first was stored.
- A reading for another data center's server, and a non-numeric value, were rejected.
