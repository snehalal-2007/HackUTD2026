import { useEffect, useRef, useState } from 'react'
import { SendHorizontalIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { useArrivals } from '@/lib/use-arrivals'
import { AgentMessage, OperatorMessage } from './agent-message'
import type { ChatMessage } from './types'

// UI preview. The agent service (services/agent) does not answer yet, so the
// opening exchange is sample content and new questions get a plain notice.
// Phase 4 replaces this with messages stored in SpacetimeDB.
const SAMPLE: ChatMessage[] = [
  {
    id: 'sample-q',
    role: 'operator',
    time: '05:42',
    text: 'What changed on the floor in the last hour, and is anything about to cross a limit?',
  },
  {
    id: 'sample-a',
    role: 'agent',
    time: '05:42',
    stream: true,
    text:
      'CRAC-2 in Hall B lost a fan at 05:31. Inlet temperature on racks B-10 to B-12 has risen about 0.6 °C per minute since then, so B-12 is on track to cross the 32 °C limit in roughly 14 minutes.\n\nThe alert is open and owned by the night shift lead, acknowledgment due at 05:50. The closest runbook step is to shift load from B-12 to B-07 and dispatch facilities to swap the fan tray.\n\nI put the full timeline and readings in the report below.',
    attachments: [{ name: 'hall-b-cooling-incident.pdf', kind: 'PDF', size: '240 KB' }],
  },
]

const NOT_CONNECTED =
  "I can't answer yet: the agent service isn't connected to this console. Once it is, I'll read the live alerts, readings and event log to answer, and attach reports here."

function now() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(SAMPLE)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // Stay pinned to the newest message while replies stream in, unless the
  // operator has scrolled up to read something.
  useEffect(() => {
    const scroller = scrollRef.current
    const list = listRef.current
    if (!scroller || !list) return
    const onScroll = () => {
      pinned.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48
    }
    const ro = new ResizeObserver(() => {
      if (pinned.current) scroller.scrollTop = scroller.scrollHeight
    })
    scroller.addEventListener('scroll', onScroll, { passive: true })
    ro.observe(list)
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [])

  function send(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    const t = now()
    const stamp = Date.now()
    setMessages(m => [
      ...m,
      { id: `op-${stamp}`, role: 'operator', time: t, text },
      { id: `ag-${stamp}`, role: 'agent', time: t, text: NOT_CONNECTED, stream: true },
    ])
    setDraft('')
    pinned.current = true
  }

  // New messages rise in; the conversation already on screen at load does not.
  const fresh = useArrivals(messages.map(m => m.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={listRef} className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="warning" size="sm">Preview</Badge>
            <span>Sample conversation. The agent service is not connected yet.</span>
          </div>
          {messages.map(m =>
            m.role === 'operator' ? (
              <OperatorMessage key={m.id} message={m} className={fresh.has(m.id) ? 'enter-rise' : undefined} />
            ) : (
              <AgentMessage
                key={m.id}
                message={m}
                className={fresh.has(m.id) ? 'enter-rise' : undefined}
                pendingLabel={m.id === 'sample-a' ? 'Reading the last hour of alerts and readings...' : undefined}
              />
            ),
          )}
        </div>
      </div>

      <form onSubmit={send} className="shrink-0 border-t bg-background">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2 px-4 py-3">
          <label htmlFor="agent-input" className="sr-only">
            Message the agent
          </label>
          <textarea
            id="agent-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            rows={1}
            placeholder="Message the agent"
            className="max-h-40 min-h-9 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send">
            <SendHorizontalIcon aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  )
}
