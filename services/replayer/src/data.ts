import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

/** One row of the extracted sample (see scripts/extract_summit.py). */
export interface SampleRow {
  measuredAtMs: number // original Summit timestamp, ms since epoch (UTC)
  region: string
  datacenterId: string
  datacenterName: string
  rackId: string
  serverId: string
  sourceHostname: string
  nodeState: string
  jobActive: boolean
  gpuFailure: boolean
  gpuTempC: number
  cpuTempC: number
  gpuPowerW: number
  cpuPowerW: number
  nodePowerW: number
  gpuUtilPct: number
  cpuUtilPct: number
}

/** A sample time and every reading taken at it, grouped by data center. */
export interface Tick {
  offsetMs: number // time since the first sample
  byDatacenter: Map<string, SampleRow[]>
}

const COLUMNS = [
  'measured_at', 'region', 'datacenter_id', 'datacenter_name', 'rack_id', 'server_id',
  'source_hostname', 'node_state', 'job_active', 'gpu_failure',
  'gpu_temp_c', 'cpu_temp_c', 'gpu_power_w', 'cpu_power_w', 'node_power_w',
  'gpu_util_pct_derived', 'cpu_util_pct_derived',
] as const

export function loadTicks(file: string, onlyDatacenters?: Set<string>): Tick[] {
  const text = gunzipSync(readFileSync(file)).toString('utf8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  const header = lines[0].split(',')
  if (COLUMNS.some((c, i) => header[i] !== c)) {
    throw new Error(`unexpected columns in ${file}: ${header.join(',')}`)
  }

  const byTime = new Map<number, Map<string, SampleRow[]>>()
  for (const line of lines.slice(1)) {
    // No field in the sample contains a comma, so a plain split is safe.
    const f = line.split(',')
    const row: SampleRow = {
      measuredAtMs: Date.parse(`${f[0]}Z`),
      region: f[1],
      datacenterId: f[2],
      datacenterName: f[3],
      rackId: f[4],
      serverId: f[5],
      sourceHostname: f[6],
      nodeState: f[7],
      jobActive: f[8] === '1',
      gpuFailure: f[9] === '1',
      gpuTempC: Number(f[10]),
      cpuTempC: Number(f[11]),
      gpuPowerW: Number(f[12]),
      cpuPowerW: Number(f[13]),
      nodePowerW: Number(f[14]),
      gpuUtilPct: Number(f[15]),
      cpuUtilPct: Number(f[16]),
    }
    if (onlyDatacenters && !onlyDatacenters.has(row.datacenterId)) continue
    let dcs = byTime.get(row.measuredAtMs)
    if (!dcs) byTime.set(row.measuredAtMs, (dcs = new Map()))
    let rows = dcs.get(row.datacenterId)
    if (!rows) dcs.set(row.datacenterId, (rows = []))
    rows.push(row)
  }

  const times = [...byTime.keys()].sort((a, b) => a - b)
  if (times.length === 0) throw new Error('no rows matched')
  return times.map(t => ({ offsetMs: t - times[0], byDatacenter: byTime.get(t)! }))
}
