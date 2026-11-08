import { useMemo } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { reducers, tables } from '@mesa/bindings'

// Live agent conversation from SpacetimeDB, one per operator: this browser's questions (agent_chat), the agent's
// working steps (agent_step), and the incident reports it wrote because one of those questions asked for them
// (incident_report), merged into one thread. Note: the tables are public, so this is a per-person view, not privacy.

export const ms = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n)

export interface ReportJson {
  summary: string
  impact?: { kind?: string; severity?: string; peak_value?: string; duration_s?: number }
  timeline?: { ts: string; text: string }[]
  automated_actions?: { rule: string; result: string }[]
  likely_cause?: string
  follow_ups?: string[]
  ai_drafted?: boolean
}

export function useAgentChat() {
  const conn = useSpacetimeDB()
  const [chats, chatsReady] = useTable(tables.agentChat)
  const [steps] = useTable(tables.agentStep)
  const [reports] = useTable(tables.incidentReport)
  const [incidents] = useTable(tables.incident)
  const askReducer = useReducer(reducers.askAgent)

  const data = useMemo(() => {
    const stepsByChat = new Map<bigint, (typeof steps)[number][]>()
    for (const s of steps) stepsByChat.set(s.chatId, [...(stepsByChat.get(s.chatId) ?? []), s])
    for (const list of stepsByChat.values()) list.sort((a, b) => (a.stepId < b.stepId ? -1 : 1))
    const incidentById = new Map(incidents.map(i => [i.incidentId, i]))

    type Item =
      | { type: 'chat'; key: string; at: number; chat: (typeof chats)[number]; steps: (typeof steps)[number][] }
      | { type: 'report'; key: string; at: number; report: (typeof reports)[number]; body: ReportJson | null; incident: (typeof incidents)[number] | undefined }
    const me = conn.identity
    const mine = me ? chats.filter(c => c.askedBy.isEqual(me)) : []
    // Reports this operator asked for: the agent logs a "Write … report for incident #N" step on the question.
    const myReportIncidents = new Set(
      mine.flatMap(c => (stepsByChat.get(c.chatId) ?? []).map(s => /^Write \w+ report for incident #(\d+)/.exec(s.title)?.[1]).filter(Boolean) as string[]),
    )
    const items: Item[] = [
      ...mine.map(c => ({ type: 'chat' as const, key: `c${c.chatId}`, at: ms(c.askedAt), chat: c, steps: stepsByChat.get(c.chatId) ?? [] })),
      ...reports.filter(r => myReportIncidents.has(String(r.incidentId))).map(r => {
        let body: ReportJson | null = null
        try {
          body = JSON.parse(r.reportJson) as ReportJson
        } catch {
          body = null // a malformed report still shows as an entry
        }
        return { type: 'report' as const, key: `r${r.reportId}`, at: ms(r.writtenAt), report: r, body, incident: incidentById.get(r.incidentId) }
      }),
    ].sort((a, b) => a.at - b.at)
    const myPending = mine.filter(c => c.status === 'pending' || c.status === 'thinking').length
    return { items, myPending }
  }, [chats, steps, reports, incidents, conn.identity])

  return { ...data, ready: chatsReady, ask: (question: string) => askReducer({ question }) }
}

export type ThreadItem = ReturnType<typeof useAgentChat>['items'][number]
