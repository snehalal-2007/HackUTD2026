import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import type { Hall } from './data'

// A block's tasks: the active incidents on its rack (the rules open incidents per rack; a rack is one row of 3 blocks).

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
export const rackOf = (hall: Hall) => hall.id.split('#')[0]

/** Active tasks on this block's rack, most urgent first. */
export function useBlockTasks(hall: Hall) {
  const [incidents] = useTable(tables.incident)
  const rack = rackOf(hall)
  return incidents
    .filter(i => i.rackId === rack && i.status !== 'closed')
    .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9))
}
