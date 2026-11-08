// Opening the Floor page on a specific block from elsewhere (the Alerts dashboard): the target is parked in
// sessionStorage, and FloorView reads it once when it mounts.
const KEY = 'mesa:floor-open'

export interface FloorTarget {
  site: string
  floor: number
  block: string // hall id
}

export function setFloorTarget(t: FloorTarget) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    // storage blocked: the Floor page opens on its default block
  }
}

/** The parked target, removed as it's read so a later visit opens normally. */
export function takeFloorTarget(): FloorTarget | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return raw ? (JSON.parse(raw) as FloorTarget) : null
  } catch {
    return null
  }
}
