import { SITES } from './data'

// The names operators see. The telemetry has 8 feeds with placeholder names (Spartanburg, North Carolina, Site 3 … Site 8)
// and raw Summit cabinet ids (a18, c35). The console shows each feed as one floor of an NMC² site and each cabinet as a row
// of three blocks (A1–A3). services/agent/src/names.ts mirrors this; keep the two in sync.

/** telemetry datacenter id → where it sits in the site model */
export const PLACE = new Map(
  SITES.flatMap(site => site.floors.flatMap((dcs, i) => dcs.map(dc => [dc, { site: site.id, siteName: site.name, floor: i + 1 }] as const))),
)

/** "dc-site-3" → "Spartanburg · Floor 2" */
export const placeName = (datacenterId: string) => {
  const p = PLACE.get(datacenterId)
  return p ? `${p.siteName} · Floor ${p.floor}` : datacenterId
}

/**
 * Row letters unique across every site: each rack is one row, lettered in site → floor → rack order
 * (Spartanburg floor 1 = A, B; floor 2 = C, D; …). Blocks in a row are numbered 1–3: A1 A2 A3, B1 B2 B3, …
 */
export function rowLetters(rackIds: readonly string[]) {
  const rows = new Map<string, string>()
  let row = 0
  for (const site of SITES) {
    for (const dcs of site.floors) {
      for (const id of rackIds.filter(r => dcs.includes(r.split('/')[0])).sort()) rows.set(id, String.fromCharCode(65 + row++))
    }
  }
  return rows
}

/**
 * Rewrites text written with telemetry names into console names, for display only (stored text is never changed, so the
 * audit chain still verifies): "Site 4 rack a03: GPU at 50.3 °C" → "Spartanburg · Floor 3 · blocks E1–E3: GPU at 50.3 °C".
 */
export function makeNamer(datacenters: readonly { datacenterId: string; name: string }[], rackIds: readonly string[]) {
  const letters = rowLetters(rackIds)
  const blocks = (rackId: string) => {
    const L = letters.get(rackId)
    return L ? `blocks ${L}1–${L}3` : `rack ${rackId.split('/')[1] ?? rackId}`
  }
  const byRawName = new Map(datacenters.map(d => [d.name, d.datacenterId]))
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const names = [...byRawName.keys()].sort((a, b) => b.length - a.length).map(esc)
  const re = names.length ? new RegExp(`\\b(${names.join('|')})(?: rack (\\w+))?(?=[\\s:,.)]|$)`, 'g') : null
  const ids = [...PLACE.keys()].sort((a, b) => b.length - a.length).map(esc)
  const idRe = new RegExp(`\\b(${ids.join('|')})(?:/(\\w+))?\\b`, 'g') // raw ids too: "dc-site-5 feed", "dc-x/a18"
  const text = (s: string) => {
    const named = re
      ? s.replace(re, (_m, raw: string, cab?: string) => {
          const dc = byRawName.get(raw)!
          return cab ? `${placeName(dc)} · ${blocks(`${dc}/${cab}`)}` : placeName(dc)
        })
      : s
    return named.replace(idRe, (_m, dc: string, cab?: string) => (cab ? `${placeName(dc)} · ${blocks(`${dc}/${cab}`)}` : placeName(dc)))
  }
  /** Which telemetry data center a piece of text is about ('' if none): raw ids first, then the feeds' raw names. */
  const locate = (s: string) => {
    const id = new RegExp(idRe.source).exec(s)?.[1]
    if (id) return id
    const raw = re ? new RegExp(re.source).exec(s)?.[1] : undefined
    return raw ? byRawName.get(raw) ?? '' : ''
  }
  return { place: placeName, blocks, text, locate }
}
