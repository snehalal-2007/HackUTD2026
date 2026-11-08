import { useEffect, useRef, useState } from 'react'
import { FileTextIcon, SendHorizontalIcon } from 'lucide-react'
import { Attachment, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from '@/components/ui/attachment'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { MesaGlyph } from '@/components/shell/brand-mark'
import { Message, MessageAvatar, MessageContent, MessageFooter } from '@/components/ui/message'
import { Spinner } from '@/components/ui/spinner'
import { useArrivals } from '@/lib/use-arrivals'
import { cn } from '@/lib/utils'
import { ReportView } from './report-view'
import { ms, useAgentChat, type ThreadItem } from './use-agent-chat'

// The operator ↔ agent chat, live from SpacetimeDB. Questions go through ask_agent; the agent service
// (services/agent) answers with Claude and writes its working steps, which the right-hand panel shows live.
// The agent's own incident reports appear in the same thread as attachments.

const SUGGESTIONS = ['Which rack is hottest right now?', 'Summarize the open incidents.', 'Is any data center feed silent?']
const MAX_PENDING = 3

const clock = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const secs = (n: number) => `${(n / 1000).toFixed(1)} s`

/** Renders the small Markdown subset the agent uses: **bold**, "- " bullet lists and paragraphs. Text only, no HTML. */
function AnswerText({ text, className }: { text: string; className?: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i} className="font-semibold">{part.slice(2, -2)}</b> : part))
  const blocks: { list: boolean; lines: string[] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*•]\s+/.test(line)
    if (!line.trim()) { blocks.push({ list: false, lines: [] }); continue }
    const last = blocks[blocks.length - 1]
    if (last && last.list === bullet && last.lines.length) last.lines.push(bullet ? line.replace(/^\s*[-*•]\s+/, '') : line)
    else blocks.push({ list: bullet, lines: [bullet ? line.replace(/^\s*[-*•]\s+/, '') : line] })
  }
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {blocks.filter(b => b.lines.length).map((b, i) =>
        b.list ? <ul key={i} className="flex list-disc flex-col gap-1 pl-5">{b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}</ul> : <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>,
      )}
    </div>
  )
}

function AgentAvatar() {
  return (
    <MessageAvatar className="rounded-none bg-transparent text-black group-has-data-[slot=message-footer]/message:-translate-y-6 dark:text-white"> {/* lifted a little less than the default (-8), so the mark sits lower */} {/* no circle or border: just the MESA mark, black (white in dark mode so it stays visible) */}
      <MesaGlyph className="size-7" />
    </MessageAvatar>
  )
}

function ChatEntry({ item, className }: { item: Extract<ThreadItem, { type: 'chat' }>; className?: string }) {
  const { chat, steps } = item
  const live = chat.status === 'pending' || chat.status === 'thinking'
  return (
    <>
      <Message align="end" className={className}>
        <MessageContent>
          <Bubble variant="muted">
            <BubbleContent className="whitespace-pre-wrap">{chat.question}</BubbleContent>
          </Bubble>
          <MessageFooter>
            <span className="tabular-nums">{chat.askerName} · {clock(ms(chat.askedAt))}</span>
          </MessageFooter>
        </MessageContent>
      </Message>
      <Message className={className}>
        <AgentAvatar />
        <MessageContent>
          <span role="status" className="sr-only">{live ? 'Agent is working' : 'Reply ready'}</span>
          <Bubble variant="ghost" aria-busy={live}>
            <BubbleContent>
              {live ? (
                <Marker>
                  <MarkerIcon>
                    <Spinner />
                  </MarkerIcon>
                  <MarkerContent>
                    <span className="animate-pulse motion-reduce:animate-none">
                      {chat.status === 'pending' ? 'Sending to the agent…' : `Thinking · ${steps.length} step${steps.length === 1 ? '' : 's'} so far`}
                    </span>
                  </MarkerContent>
                </Marker>
              ) : (
                <AnswerText text={chat.answer} className={chat.status === 'failed' ? 'text-destructive' : undefined} />
              )}
            </BubbleContent>
          </Bubble>
          <MessageFooter className="gap-2">
            {!live && <span className="tabular-nums">{clock(ms(chat.answeredAt))}</span>}
            {chat.status === 'answered' && <span>AI drafted · {secs(chat.durationMs)}</span>}
          </MessageFooter>
        </MessageContent>
      </Message>
    </>
  )
}

function ReportEntry({ item, className }: { item: Extract<ThreadItem, { type: 'report' }>; className?: string }) {
  const { report, body, incident } = item
  const [open, setOpen] = useState(false)
  const name = `${report.kind === 'final' ? 'Final' : 'Interim'} report · incident #${String(report.incidentId)}`
  return (
    <Message className={className}>
      <AgentAvatar />
      <MessageContent>
        <Bubble variant="ghost">
          <BubbleContent>
            <p>{body?.summary ?? `I wrote the ${report.kind} report for ${incident?.title ?? `incident #${String(report.incidentId)}`}.`}</p>
          </BubbleContent>
        </Bubble>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full max-w-sm rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Attachment className={cn('w-full transition-colors hover:border-foreground/30', open && 'border-foreground/60')}>
            <AttachmentMedia>
              <FileTextIcon aria-hidden="true" />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{name}</AttachmentTitle>
              <AttachmentDescription>
                {incident?.title ?? 'Incident report'}
                <span aria-hidden="true" className="mx-1.5 inline-block size-1 rounded-full bg-muted-foreground/40 align-middle" />
                {report.source === 'claude' ? 'AI drafted' : 'Template'}
              </AttachmentDescription>
            </AttachmentContent>
          </Attachment>
        </button>
        {open && (
          <div className="w-full rounded-lg border bg-card p-4">
            <ReportView item={item} />
          </div>
        )}
        <MessageFooter>
          <span className="tabular-nums">{clock(ms(report.writtenAt))}</span>
        </MessageFooter>
      </MessageContent>
    </Message>
  )
}

/**
 * `compact` marks the side-panel use (Shift Handoff); the chat has no thought-process column any more, so it needs no change.
 * `suggestions` replaces the starter questions. The agent's rules are unchanged: it reads, it never acts.
 */
export function AgentChat({ suggestions = SUGGESTIONS }: { compact?: boolean; suggestions?: string[] } = {}) {
  const { items, myPending, ready, ask } = useAgentChat()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // Stay pinned to the newest message while answers arrive, unless the operator has scrolled up to read something.
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

  async function send(text: string) {
    const q = text.trim()
    if (!q) return
    setError('')
    try {
      await ask(q)
      setDraft('')
      pinned.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // New questions and reports rise in; the thread already on screen when it loads does not.
  const fresh = useArrivals(items.map(i => i.key), ready)

  const busy = myPending >= MAX_PENDING
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* the conversation, floating on the page background */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div ref={listRef} className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
            {!ready ? (
              <p className="text-sm text-muted-foreground">Connecting…</p>
            ) : !items.length ? (
              <Message>
                <AgentAvatar />
                <MessageContent>
                  <Bubble variant="ghost">
                    <BubbleContent>
                      <p>I read live telemetry, incidents and the audit log to answer. I can’t change anything, and I write an incident report when you ask for one.</p>
                    </BubbleContent>
                  </Bubble>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map(s => (
                      <Button key={s} type="button" variant="outline" size="sm" className="h-auto max-w-full py-1 text-left whitespace-normal" onClick={() => void send(s)}>{s}</Button>
                    ))}
                  </div>
                </MessageContent>
              </Message>
            ) : (
              items.map(item =>
                item.type === 'chat' ? (
                  <ChatEntry key={item.key} item={item} className={fresh.has(item.key) ? 'enter-rise' : undefined} />
                ) : (
                  <ReportEntry key={item.key} item={item} className={fresh.has(item.key) ? 'enter-rise' : undefined} />
                ),
              )
            )}
          </div>
        </div>

        <form onSubmit={e => { e.preventDefault(); void send(draft) }} className="shrink-0 border-t bg-background">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-1.5 px-4 py-3">
            <div className="flex items-end gap-2">
              <label htmlFor="agent-input" className="sr-only">Message the agent</label>
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
                maxLength={1000}
                disabled={busy}
                placeholder={busy ? 'Waiting for the agent to answer your earlier questions…' : 'Message the agent'}
                className="max-h-40 min-h-9 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
              />
              <Button type="submit" size="icon" disabled={!draft.trim() || busy} aria-label="Send">
                <SendHorizontalIcon aria-hidden="true" />
              </Button>
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
        </form>
      </div>

    </div>
  )
}
