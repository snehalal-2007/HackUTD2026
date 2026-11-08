// Mirrors module/src/lib/log.ts so the browser can check the event log independently.

const GENESIS = '0'.repeat(16)

function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i))
    h = (h * prime) & mask
  }
  return h.toString(16).padStart(16, '0')
}

export interface ChainRow {
  seq: string
  atMicros: string
  actor: string
  action: string
  target: string
  incidentId: string // '' when none
  prevHash: string
  hash: string
}

export type ChainResult = { ok: true; count: number } | { ok: false; count: number; brokenAt: string; reason: string }

/** Recomputes every hash in order and checks each row links to the one before it. */
export function verifyChain(rows: ChainRow[]): ChainResult {
  const sorted = [...rows].sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : 1))
  let prev = GENESIS
  for (const r of sorted) {
    if (r.prevHash !== prev) return { ok: false, count: sorted.length, brokenAt: r.seq, reason: 'does not link to the previous event' }
    const expected = fnv1a64([r.prevHash, r.atMicros, r.actor, r.action, r.target, r.incidentId].join('|'))
    if (expected !== r.hash) return { ok: false, count: sorted.length, brokenAt: r.seq, reason: 'was changed after it was written' }
    prev = r.hash
  }
  return { ok: true, count: sorted.length }
}
