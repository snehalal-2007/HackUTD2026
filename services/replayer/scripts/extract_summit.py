"""Extract a small, replayable slice of OLCF Summit telemetry for MESA.

Source: ClusterWise (OLCF Summit telemetry), CC BY 4.0
https://huggingface.co/datasets/MachaParfait/ClusterWise

Reads only the needed columns and rows over HTTPS with DuckDB (no full download),
picks the cabinets with the most GPU temperature movement in the window, maps each
cabinet to a MESA data center and rack, and writes one gzipped CSV row per server
per sample.

Run from the repo root:
  uv run --with duckdb python -I services/replayer/scripts/extract_summit.py \
      --day 20200106 --racks 16 --minutes 60 --out services/replayer/data/summit-sample.csv.gz
"""

import argparse
import gzip
import csv

import duckdb

# Eight MESA data centers, two cabinets each. Spartanburg and North Carolina are
# NMC² sites; the other six are neutral placeholders.
DATACENTERS = [
    ("dc-spartanburg", "us-southeast", "Spartanburg"),
    ("dc-north-carolina", "us-southeast", "North Carolina"),
    ("dc-site-3", "us-east", "Site 3"),
    ("dc-site-4", "us-east", "Site 4"),
    ("dc-site-5", "us-central", "Site 5"),
    ("dc-site-6", "us-central", "Site 6"),
    ("dc-site-7", "us-west", "Site 7"),
    ("dc-site-8", "us-west", "Site 8"),
]

# Rated maximums used to derive utilization estimates from power draw.
# The dataset has no utilization counters, so these columns are labeled derived.
V100_MAX_W = 300.0  # NVIDIA V100 SXM2 board power
POWER9_MAX_W = 250.0  # IBM Power9 socket, approximate

GPU_TEMPS = [f"gpu{i}_core_temp" for i in range(6)]
GPU_POWERS = [f"p{p}_gpu{g}_power" for p in (0, 1) for g in (0, 1, 2)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", default="20200106", help="YYYYMMDD file in the dataset")
    ap.add_argument("--racks", type=int, default=16)
    ap.add_argument("--minutes", type=int, default=60)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    url = (
        "https://huggingface.co/datasets/MachaParfait/ClusterWise/resolve/main/"
        f"{args.day[:6]}/{args.day}.parquet"
    )
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")

    start = con.execute(f"SELECT MIN(timestamp) FROM '{url}'").fetchone()[0]
    window = f"timestamp >= TIMESTAMP '{start}' AND timestamp < TIMESTAMP '{start}' + INTERVAL {args.minutes} MINUTE"

    gpu_temp_max = "GREATEST(" + ", ".join(f"coalesce({c}, 0)" for c in GPU_TEMPS) + ")"
    gpu_power_sum = " + ".join(f"coalesce({c}, 0)" for c in GPU_POWERS)

    con.execute(f"""
        CREATE TABLE slice AS
        SELECT
          timestamp,
          hostname,
          substr(hostname, 1, 3) AS cabinet,
          node_state,
          coalesce(allocation_id, 0) AS allocation_id,
          coalesce(label, 0) AS failure,
          {gpu_temp_max} AS gpu_temp_c,
          GREATEST(coalesce(p0_temp_max, 0), coalesce(p1_temp_max, 0)) AS cpu_temp_c,
          {gpu_power_sum} AS gpu_power_w,
          coalesce(p0_power, 0) + coalesce(p1_power, 0) AS cpu_power_w,
          coalesce(ps0_input_power, 0) + coalesce(ps1_input_power, 0) AS node_power_w
        FROM '{url}'
        WHERE {window} AND hostname IS NOT NULL
    """)

    racks = [
        r[0]
        for r in con.execute(f"""
            SELECT cabinet FROM slice
            GROUP BY cabinet
            HAVING COUNT(DISTINCT hostname) = 18
            ORDER BY stddev_samp(gpu_temp_c) DESC
            LIMIT {args.racks}
        """).fetchall()
    ]
    if len(racks) < args.racks:
        raise SystemExit(f"only {len(racks)} full cabinets in the window")

    rack_map = {}
    for i, cab in enumerate(racks):
        dc = DATACENTERS[i % len(DATACENTERS)]
        rack_map[cab] = dc

    rows = con.execute(f"""
        SELECT * FROM slice WHERE cabinet IN ({", ".join(f"'{c}'" for c in racks)})
        ORDER BY timestamp, hostname
    """).fetchall()
    cols = [d[0] for d in con.description]
    idx = {c: i for i, c in enumerate(cols)}

    with gzip.open(args.out, "wt", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "measured_at", "region", "datacenter_id", "datacenter_name", "rack_id", "server_id",
            "source_hostname", "node_state", "job_active", "gpu_failure",
            "gpu_temp_c", "cpu_temp_c", "gpu_power_w", "cpu_power_w", "node_power_w",
            "gpu_util_pct_derived", "cpu_util_pct_derived",
        ])
        for r in rows:
            cab = r[idx["cabinet"]]
            dc_id, region, dc_name = rack_map[cab]
            host = r[idx["hostname"]]
            gpu_w = r[idx["gpu_power_w"]]
            cpu_w = r[idx["cpu_power_w"]]
            w.writerow([
                r[idx["timestamp"]].isoformat(),
                region, dc_id, dc_name,
                f"{dc_id}/{cab}", f"{dc_id}/{host}", host,
                r[idx["node_state"]],
                1 if r[idx["allocation_id"]] else 0,
                1 if r[idx["failure"]] else 0,
                round(r[idx["gpu_temp_c"]], 2), round(r[idx["cpu_temp_c"]], 2),
                round(gpu_w, 1), round(cpu_w, 1), round(r[idx["node_power_w"]], 1),
                round(min(100.0, 100.0 * gpu_w / (6 * V100_MAX_W)), 1),
                round(min(100.0, 100.0 * cpu_w / (2 * POWER9_MAX_W)), 1),
            ])

    ts = con.execute("SELECT COUNT(DISTINCT timestamp) FROM slice").fetchone()[0]
    print(f"wrote {len(rows)} rows, {len(racks)} racks, {len(racks) * 18} servers, {ts} samples from {start}")
    for cab, dc in rack_map.items():
        print(f"  {cab} -> {dc[0]}")


if __name__ == "__main__":
    main()
