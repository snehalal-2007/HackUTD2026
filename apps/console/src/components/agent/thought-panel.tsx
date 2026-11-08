import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangleIcon, BrainIcon, CheckIcon, DatabaseIcon, FileTextIcon, MessageCircleIcon, SparklesIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ms, type ThreadItem } from './use-agent-chat'

// Right-hand panel: how the agent worked out the selected answer (live while it's thinking),
// or the full content of a selected incident report.

type ChatItem = Extract<ThreadItem, { type: 'chat' }>
type ReportItem = Extract<ThreadItem, { type: 'report' }>

const secs = (n: number) => (n < 10_000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n / 1000)} s`)

// ── The thought graph ──
// A radial network that always fits the panel: the question sits in the middle, each Thinking step branches off it
// (clockwise from the top, in order), each lookup fans out from its Thinking step (Fetching info → Got response),
// and the answer closes the circle. Edges are plain arrows.

type Stage = 'question' | 'thinking' | 'fetching' | 'response' | 'problem' | 'done'
const STAGE: Record<Stage, { icon: typeof BrainIcon; label: string; fill: string; size: number }> = {
  question: { icon: MessageCircleIcon, label: 'Question', fill: 'bg-[#e98ad8] text-white', size: 58 },
  thinking: { icon: BrainIcon, label: 'Thinking', fill: 'bg-[#7c5cf0] text-white', size: 48 },
  fetching: { icon: DatabaseIcon, label: 'Fetching info', fill: 'bg-[#4a7fe0] text-white', size: 40 },
  response: { icon: CheckIcon, label: 'Got response', fill: 'bg-[#2f9e6e] text-white', size: 36 },
  problem: { icon: AlertTriangleIcon, label: 'Problem', fill: 'bg-destructive text-white', size: 48 },
  done: { icon: SparklesIcon, label: 'Answer ready', fill: 'bg-[#18181b] text-white dark:bg-[#f4f4f5] dark:text-[#18181b]', size: 52 },
}

/** "Read rack dc-spartanburg/a18 (console: Spartanburg, SC · Floor 1 · blocks A1–A3)" → "Blocks A1–A3 · Floor 1" */
function shortLabel(title: string) {
  const rack = /^Read rack \S+ \(console: [^·]+· Floor (\d+) · blocks ([^)]+)\)/.exec(title)
  if (rack) return `Blocks ${rack[2]} · Floor ${rack[1]}`
  return title.replace(/^Read /, '').replace(/^\w/, c => c.toUpperCase())
}

interface GNode { id: string; stage: Stage; sub?: string; x: number; y: number; live?: boolean }
interface GEdge { from: string; to: string; live?: boolean }

const ROUND_GAP_MS = 400 // lookups closer together than this were made in the same round (one Claude turn)
const PAD_X = 62 // room for a node's label on the left/right edge
const PAD_Y = 34

function layout(item: ChatItem, W: number, H: number) {
  const { chat, steps } = item
  // Rounds: each Claude turn = a Thinking step plus the lookups it made.
  const rounds: { pairs: { fetch: (typeof steps)[number]; result?: (typeof steps)[number] }[] }[] = []
  let errorTitle: string | undefined
  let prevAt = 0
  for (const s of steps) {
    const at = ms(s.at)
    const cur = rounds[rounds.length - 1]
    if (s.kind === 'thinking') {
      if (!cur || cur.pairs.length) rounds.push({ pairs: [] })
    } else if (s.kind === 'lookup') {
      if (!cur || (cur.pairs.length && at - prevAt > ROUND_GAP_MS)) rounds.push({ pairs: [] })
      rounds[rounds.length - 1].pairs.push({ fetch: s })
    } else if (s.kind === 'result') {
      const pair = cur?.pairs.find(p => !p.result)
      if (pair) pair.result = s
    } else errorTitle = s.title
    prevAt = at
  }
  const live = chat.status === 'pending' || chat.status === 'thinking'
  const waitingOnLookup = live && rounds.some(r => r.pairs.some(p => !p.result))
  const tail: GNode['stage'] | null = live ? (waitingOnLookup ? null : 'thinking') : chat.status === 'answered' ? 'done' : 'problem'

  const cx = W / 2, cy = H / 2
  const rx = Math.max(40, W / 2 - PAD_X), ry = Math.max(40, H / 2 - PAD_Y - 14)
  const at = (theta: number, r: number) => ({ x: cx + Math.cos(theta) * rx * r, y: cy + Math.sin(theta) * ry * r })
  // Each step gets a slice of the circle sized by how many lookups it made, so busy steps get room to fan out.
  const weights = [...rounds.map(r => Math.max(1, r.pairs.length)), ...(tail ? [1] : [])]
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const slices: { mid: number; width: number }[] = []
  let start = -Math.PI / 2 - (Math.PI * weights[0]) / total // first slice centred on the top
  for (const w of weights) {
    const width = (2 * Math.PI * w) / total
    slices.push({ mid: start + width / 2, width })
    start += width
  }

  // A response sits one hop further out than its fetch; at the panel's side it turns up or down instead.
  const HOP = 84
  const outward = (p: { x: number; y: number }, theta: number) => {
    let { x, y } = at(theta, 0.97)
    if (Math.hypot(x - p.x, y - p.y) < HOP) {
      x = Math.min(W - PAD_X, Math.max(PAD_X, x))
      y = p.y + (Math.sin(theta) >= 0 ? 1 : -1) * HOP
    }
    return { x, y: Math.min(H - PAD_Y - 22, Math.max(PAD_Y, y)) }
  }
  const nodes: GNode[] = [{ id: 'q', stage: 'question', x: cx, y: cy }]
  const edges: GEdge[] = []
  rounds.forEach((r, ri) => {
    const { mid: th, width } = slices[ri], hub = `t${ri}`
    const n = r.pairs.length
    nodes.push({ id: hub, stage: 'thinking', ...at(th, n ? 0.3 : 0.5) })
    edges.push({ from: 'q', to: hub })
    const step = n > 1 ? (width * 0.92) / n : 0
    r.pairs.forEach((p, i) => {
      const a = th + (i - (n - 1) / 2) * step
      const f = `f${ri}-${i}`, g = `g${ri}-${i}`
      const fp = at(a, 0.64)
      nodes.push({ id: f, stage: 'fetching', sub: shortLabel(p.fetch.title), ...fp })
      edges.push({ from: hub, to: f })
      const waiting = !p.result && live
      if (p.result || waiting) {
        nodes.push({ id: g, stage: 'response', sub: p.result?.title, live: waiting, ...outward(fp, a) })
        edges.push({ from: f, to: g, live: waiting })
      }
    })
  })
  if (tail) {
    const pos = at(slices[rounds.length].mid, 0.72)
    if (tail === 'thinking') {
      nodes.push({ id: 'now', stage: 'thinking', sub: chat.status === 'pending' ? 'Waiting for the agent' : undefined, live: true, ...pos })
      edges.push({ from: 'q', to: 'now', live: true })
    } else {
      const ok = tail === 'done'
      nodes.push({ id: 'end', stage: tail, sub: ok ? secs(chat.durationMs) : errorTitle ?? 'Could not answer', ...pos })
      edges.push({ from: 'q', to: 'end' })
    }
  }
  separate(nodes, W, H)
  // Crowded graphs get smaller circles so nothing overlaps.
  const scale = Math.max(0.62, Math.min(1, 1 - (nodes.length - 9) * 0.03, Math.min(W, H) / 420))
  return { nodes, edges, scale }
}

/** Final pass: push apart any two nodes whose circle + label boxes overlap, so text never sits on another node. */
function separate(nodes: GNode[], W: number, H: number) {
  const BOX_W = 112, BOX_H = (v: GNode) => STAGE[v.stage].size + 30 // circle plus two label lines
  for (let pass = 0; pass < 80; pass++) {
    let moved = false
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const ox = BOX_W - Math.abs(a.x - b.x), oy = (BOX_H(a) + BOX_H(b)) / 2 - Math.abs(a.y - b.y)
        if (ox <= 0 || oy <= 0) continue
        moved = true
        const horiz = ox < oy * 0.8
        const sign = horiz ? (a.x <= b.x ? -1 : 1) : a.y <= b.y ? -1 : 1
        const push = (horiz ? ox : oy) / 2 + 1
        const move = (v: GNode, dir: number) => {
          if (v.id === 'q') return
          if (horiz) v.x = Math.min(W - PAD_X, Math.max(PAD_X, v.x + dir * push * (a.id === 'q' || b.id === 'q' ? 2 : 1)))
          else v.y = Math.min(H - PAD_Y - 22, Math.max(PAD_Y, v.y + dir * push * (a.id === 'q' || b.id === 'q' ? 2 : 1)))
        }
        move(a, sign)
        move(b, -sign)
      }
    if (!moved) return
  }
}

function ThoughtGraph({ item }: { item: ChatItem }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ W: 380, H: 640 })
  useEffect(() => {
    const el = boxRef.current!
    const ro = new ResizeObserver(() => setSize({ W: Math.max(240, el.clientWidth), H: Math.max(320, el.clientHeight) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { W, H } = size
  const { nodes, edges, scale } = layout(item, W, H)
  const byId = new Map(nodes.map(n => [n.id, n]))
  const r = (n: GNode) => (STAGE[n.stage].size * scale) / 2

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden" role="img" aria-label={`How the agent worked it out: ${nodes.map(n => STAGE[n.stage].label + (n.sub ? ` (${n.sub})` : '')).join(', ')}`}>
      <svg className="absolute inset-0" width={W} height={H} aria-hidden="true">
        <defs>
          <marker id="thought-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground/60" />
          </marker>
        </defs>
        {edges.map(e => {
          const a = byId.get(e.from)!, b = byId.get(e.to)!
          const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
          const ux = dx / len, uy = dy / len
          const x1 = a.x + ux * (r(a) + 2), y1 = a.y + uy * (r(a) + 2), x2 = b.x - ux * (r(b) + 3), y2 = b.y - uy * (r(b) + 3)
          return (
            <g key={`${e.from}-${e.to}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1.3} markerEnd="url(#thought-arrow)" className={cn('stroke-muted-foreground/45', e.live && 'thought-edge-live stroke-chart-1')} />
            </g>
          )
        })}
      </svg>
      {nodes.map(n => {
        const st = STAGE[n.stage]
        const Icon = st.icon
        const d = st.size * scale
        return (
          <div key={n.id} className="absolute flex w-[118px] -translate-x-1/2 flex-col items-center text-center" style={{ left: n.x, top: n.y - d / 2 }}>
            <span
              className={cn('grid place-items-center rounded-full shadow-[0_3px_10px_rgba(24,24,27,.18)] ring-2 ring-card', st.fill, n.live && 'animate-pulse ring-chart-1 motion-reduce:animate-none')}
              style={{ width: d, height: d }}
            >
              <Icon style={{ width: d * 0.4, height: d * 0.4 }} aria-hidden="true" />
            </span>
            <span className="mt-0.5 rounded bg-card/85 px-1 text-[11.5px] leading-tight font-semibold">{n.live ? `${st.label}…` : st.label}</span>
            {n.sub && <span className="block max-w-full truncate rounded bg-card/85 px-1 text-[10.5px] leading-tight text-muted-foreground" title={n.sub}>{n.sub}</span>}
          </div>
        )
      })}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 text-[12.5px] font-semibold tracking-[.06em] text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  )
}

function ReportView({ item }: { item: ReportItem }) {
  const { report, body, incident } = item
  return (
    <>
      <div className="flex flex-col gap-2 border-b pb-4">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <FileTextIcon className="size-4" aria-hidden="true" />
          {report.kind === 'final' ? 'Final report' : 'Interim report'} · incident #{String(report.incidentId)}
        </div>
        <p className="text-[15.5px] leading-snug font-semibold">{incident?.title ?? `Incident #${String(report.incidentId)}`}</p>
        <span className="text-[12.5px] text-muted-foreground">{report.source === 'claude' ? 'AI drafted by Claude' : 'Written from a template (Claude unavailable)'}</span>
      </div>
      {!body ? (
        <p className="pt-4 text-[14px] text-muted-foreground">This report could not be read.</p>
      ) : (
        <>
          <p className="pt-4 text-[14.5px] leading-relaxed">{body.summary}</p>
          {body.impact && (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
              {[['Severity', body.impact.severity], ['Peak', body.impact.peak_value], ['Duration', body.impact.duration_s != null ? `${Math.round(body.impact.duration_s / 60)} min` : undefined]].map(([k, v]) => (
                <div key={k} className="rounded-md bg-muted px-2.5 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-semibold capitalize">{v ?? '—'}</dd></div>
              ))}
            </dl>
          )}
          {!!body.timeline?.length && (
            <Section title="Timeline">
              <ol className="flex flex-col gap-1.5 text-[13.5px]">{body.timeline.map((t, i) => <li key={i} className="grid grid-cols-[70px_minmax(0,1fr)] gap-2"><span className="font-mono text-[12px] text-muted-foreground">{t.ts}</span><span>{t.text}</span></li>)}</ol>
            </Section>
          )}
          {!!body.automated_actions?.length && (
            <Section title="What the rules did">
              <ul className="flex flex-col gap-1 text-[13.5px]">{body.automated_actions.map((a, i) => <li key={i}><b className="font-semibold">{a.rule}</b> · {a.result}</li>)}</ul>
            </Section>
          )}
          {body.likely_cause && <Section title="Likely cause"><p className="text-[13.5px] leading-relaxed">{body.likely_cause}</p></Section>}
          {!!body.follow_ups?.length && (
            <Section title="Follow-ups">
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px]">{body.follow_ups.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </Section>
          )}
        </>
      )}
    </>
  )
}

export function ThoughtPanel({ item }: { item: ThreadItem | undefined }) {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-lg bg-card shadow-[0_10px_30px_rgba(24,24,27,.08),0_2px_6px_rgba(24,24,27,.04)] dark:shadow-[0_10px_30px_rgba(0,0,0,.4)]" aria-label={item?.type === 'report' ? 'Report' : 'Thought process'}>
      {item?.type === 'chat' ? (
        <div className="min-h-0 flex-1 p-2">
          <ThoughtGraph item={item} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {item ? <ReportView item={item} /> : <p className="text-[14.5px] text-muted-foreground">Ask a question to watch the agent work it out here, live.</p>}
        </div>
      )}
    </aside>
  )
}
