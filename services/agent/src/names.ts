// Mirrors the console's site model (apps/console/src/components/floor/data.ts SITES + use-live-floors.ts naming),
// so the agent can use the names operators see. Keep the two in sync.

const SITES = [
  { name: 'Spartanburg, SC', floors: ['dc-spartanburg', 'dc-site-3', 'dc-site-4'] },
  { name: 'North Carolina', floors: ['dc-north-carolina', 'dc-site-5', 'dc-site-6'] },
  { name: 'Dallas, TX', floors: ['dc-site-7', 'dc-site-8'] },
]

export interface ConsoleName {
  site: string
  floor: number
  blocks: string // e.g. "A1–A3" (servers n01–06, n07–12, n13–18)
}

/** rackId → where the console shows it. Each rack is one row of 3 blocks; rows are lettered site → floor → rack. */
export function consoleNames(rackIds: string[]): Map<string, ConsoleName> {
  const out = new Map<string, ConsoleName>()
  let row = 0
  for (const site of SITES) {
    site.floors.forEach((dc, i) => {
      for (const id of rackIds.filter(r => r.split('/')[0] === dc).sort()) {
        const L = String.fromCharCode(65 + row++)
        out.set(id, { site: site.name, floor: i + 1, blocks: `${L}1–${L}3` })
      }
    })
  }
  return out
}

export const describeRack = (rackId: string, n: ConsoleName | undefined) =>
  n ? `${rackId} (console: ${n.site} · Floor ${n.floor} · blocks ${n.blocks})` : rackId

/** "dc-site-3" → "Spartanburg, SC · Floor 2" (the console's name for that telemetry feed) */
export function placeName(datacenterId: string) {
  for (const site of SITES) {
    const i = site.floors.indexOf(datacenterId)
    if (i >= 0) return `${site.name} · Floor ${i + 1}`
  }
  return datacenterId
}
