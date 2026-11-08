import { useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import type { Hall } from './data'

// A block's tasks: the active incidents on its rack (the rules open incidents per rack; a rack is one row of 3 blocks).

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
export const rackOf = (hall: Hall) => hall.id.split('#')[0]

/**
 * A block's tasks. Incidents are opened per rack (one row of 3 blocks), but the heat comes from one block: the hottest
 * in the row. That block owns the row's tasks (`here`); the other blocks in the row only point to it (`elsewhere`).
 * `row` is the block's row (all blocks on its rack); without it every rack task counts as `here`.
 */
export function useBlockTasks(hall: Hall, row: Hall[] = []) {
  const [incidents] = useTable(tables.incident)
  const rack = rackOf(hall)
  const tasks = incidents
    .filter(i => i.rackId === rack && i.status !== 'closed')
    .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9))
  const cause = row.length ? [...row].sort((a, b) => b.temp - a.temp)[0] : hall
  return cause.id === hall.id ? { here: tasks, elsewhere: [], cause } : { here: [], elsewhere: tasks, cause }
}
