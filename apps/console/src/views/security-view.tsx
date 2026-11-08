import { useState, type ReactNode } from 'react'
import { BanIcon, CopyIcon, ShieldAlertIcon, ShieldCheckIcon, TerminalIcon, WrenchIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { DECOYS, ago, clock, shortId, useNow, useSecurity, type QuarantineRow, type ThreatEvent } from '@/components/security/use-security'

// Honeypot overview, live from the `threat_event` and `quarantine` tables (module/src/honeypot).
// Read as a story per attacker: which traps they touched, in order, and that they are now blocked.

const ATTACK_CMD = 'pnpm demo:attack' // root script: runs security/attack-scripts/attack-demo.ts with tsx
const decoyLabel = (name: string) => DECOYS.find(d => d.name === name)?.label ?? name

function Card({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-h-0 flex-col rounded-lg bg-card p-5', className)} aria-label={title}>
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[15.5px] font-semibold">{title}</h2>
        {aside && <span className="text-[13px] text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12.5px] text-muted-foreground">{k}</div>
      <div className="truncate text-[20px] leading-tight font-semibold tabular-nums">{v}</div>
    </div>
  )
}

function SevMark({ severity }: { severity: string }) {
  const crit = severity === 'critical'
  return (
    <span className={cn('text-[12.5px] font-semibold capitalize', crit ? 'text-destructive' : 'text-warning')}>
      <span aria-hidden="true">{crit ? '◆ ' : '▲ '}</span>{severity}
    </span>
  )
}

/** The picked attacker: identity, how far they got, and every trap they touched in order, ending in the quarantine. */
function AttackerDetail({ hex, hits, q, now }: { hex: string; hits: ThreatEvent[]; q?: QuarantineRow; now: number }) {
  const first = hits[0].at.toDate()
  const last = hits[hits.length - 1].at.toDate()
  const copy = () => void navigator.clipboard?.writeText(hex).then(() => toast.success('Identity copied'))
  return (
    <article>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/12 text-destructive" aria-hidden="true">
          <ShieldAlertIcon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={copy} title={`${hex} · click to copy`} className="group inline-flex items-center gap-1.5 font-mono text-[14px] font-semibold hover:underline">
            {shortId(hex)}
            <CopyIcon className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden="true" />
          </button>
          <p className="text-[12.5px] text-muted-foreground tabular-nums">
            {hits.length} trap call{hits.length === 1 ? '' : 's'} · first seen {clock(first)} · last {ago(last, now)}
          </p>
        </div>
        {q ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-[12.5px] font-semibold text-white">
            <BanIcon className="size-3.5" aria-hidden="true" /> Blocked
          </span>
        ) : (
          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[12.5px] font-semibold text-warning">Not blocked</span>
        )}
      </header>

      <div className="mt-3.5 rounded-md bg-muted/60 px-3.5 py-2.5">
        <div className="text-[12.5px] text-muted-foreground">Full identity</div>
        <code className="block font-mono text-[12.5px] break-all">{hex}</code>
      </div>

      <h3 className="mt-4 mb-2 text-[12px] font-semibold tracking-[.06em] text-muted-foreground uppercase">What they did</h3>
      <ol className="ml-[17px] border-l border-border pl-5"> {/* timeline rail lines up with the avatar's centre */}
        {hits.map(e => (
          <li key={String(e.id)} className="relative pb-3 last:pb-0">
            <span className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-2 ring-card', e.severity === 'critical' ? 'bg-destructive' : 'bg-warning')} aria-hidden="true" />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[14px] font-semibold">Called {decoyLabel(e.decoy)}</span>
              <SevMark severity={e.severity} />
              <span className="ml-auto text-[12.5px] text-muted-foreground tabular-nums">{clock(e.at.toDate())}</span>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              <code className="font-mono">{e.decoy}</code> · hit #{e.hitNumber}{e.kind === 'repeat-intrusion' ? ' · tried again' : ''}
            </p>
          </li>
        ))}
        {q && (
          <li className="relative pt-3">
            <span className="absolute top-[18px] -left-[25px] size-2.5 rounded-full bg-foreground ring-2 ring-card" aria-hidden="true" />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[14px] font-semibold">Quarantined</span>
              <span className="ml-auto text-[12.5px] text-muted-foreground tabular-nums">{clock(q.at.toDate())}</span>
            </div>
            <p className="text-[12.5px] text-muted-foreground">Every real action from this identity is now rejected.</p>
          </li>
        )}
      </ol>

      <div className="mt-4 flex gap-2.5 rounded-md bg-muted/60 px-3.5 py-2.5 text-[13.5px] leading-normal">
        <WrenchIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p><b className="font-semibold">What to do.</b> {hits[hits.length - 1].suggestedFix}</p>
      </div>
    </article>
  )
}

function TryIt() {
  const copy = () => void navigator.clipboard?.writeText(ATTACK_CMD).then(() => toast.success('Command copied'))
  return (
    <div className="flex flex-col gap-2 self-start rounded-lg bg-card p-5 text-[13.5px]">
      <span className="flex items-center gap-2 font-semibold"><TerminalIcon className="size-4" aria-hidden="true" /> Test it</span>
      <span className="text-muted-foreground">With the local database running, play the attacker from the repo root:</span>
      <button type="button" onClick={copy} className="inline-flex w-fit items-center gap-2 rounded bg-card px-2.5 py-1 font-mono text-[13px] hover:bg-accent">
        {ATTACK_CMD} <CopyIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </button>
    </div>
  )
}

export function SecurityView() {
  const s = useSecurity()
  const now = useNow()
  const breached = s.events.length > 0
  const [pick, setPick] = useState<string | null>(null) // picked attacker's identity hex

  // events grouped per identity, oldest first inside each; attackers ordered by most recent activity
  const byId = new Map<string, ThreatEvent[]>()
  for (const e of [...s.events].reverse()) {
    const k = e.identity.toHexString()
    byId.set(k, [...(byId.get(k) ?? []), e])
  }
  const attackers = [...byId.entries()].sort((a, b) => b[1][b[1].length - 1].at.toDate().getTime() - a[1][a[1].length - 1].at.toDate().getTime())
  const quarantineOf = (hex: string) => s.quarantined.find(q => q.identity.toHexString() === hex)
  const selected = attackers.find(([hex]) => hex === pick) ?? attackers[0] // newest attacker until one is picked

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-3.5 p-3.5 lg:grid-cols-[360px_minmax(0,1fr)]"> {/* list left, details right */}
        {s.meQuarantined && (
          <div role="alert" className="flex items-center gap-3 rounded-lg bg-destructive px-5 py-3 text-[15px] text-white lg:col-span-2">
            <BanIcon className="size-5 shrink-0" aria-hidden="true" />
            This browser's identity is quarantined after {s.meQuarantined.hits} trap call{s.meQuarantined.hits === 1 ? '' : 's'}. Real actions from here will be rejected.
          </div>
        )}

        {/* status: one banner, the totals inline */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-lg bg-card px-5 py-4 lg:col-span-2">
          <div className="flex min-w-[280px] flex-1 items-center gap-4">
            <span className={cn('grid shrink-0 place-items-center', breached ? 'text-destructive' : 'text-success')} /* just the icon: no circle, no fill */>
              {breached ? <ShieldAlertIcon className="size-9" aria-hidden="true" /> : <ShieldCheckIcon className="size-9" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{!s.ready ? 'Connecting to the honeypot…' : breached ? 'Intrusion detected' : 'All clear'}</h1>
              <p className="text-[14.5px] text-muted-foreground">
                {!s.ready
                  ? 'Waiting for the threat_event and quarantine tables.'
                  : breached
                    ? `${attackers.length} identit${attackers.length === 1 ? 'y' : 'ies'} touched a trap. ${s.quarantined.length === attackers.length ? 'All are' : `${s.quarantined.length} are`} blocked from real actions.`
                    : `${DECOYS.length} traps are armed. Nobody has touched them.`}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-x-8 border-border sm:border-l sm:pl-8">
            <Stat k="Attackers" v={attackers.length} />
            <Stat k="Blocked" v={s.quarantined.length} />
            <Stat k="Trap calls" v={s.events.length} />
            <Stat k="Last" v={s.latest ? ago(s.latest.at.toDate(), now) : '—'} />
          </div>
        </div>

        {/* attacker list */}
        <Card title="Attackers" aside={breached ? `${attackers.length} · newest first` : 'Live'} className="lg:min-h-[420px]">
          {!breached ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ShieldCheckIcon className="size-8 text-success" aria-hidden="true" />
              <p className="text-[15px] font-semibold">No one has touched a trap</p>
              <p className="max-w-xs text-[13.5px] text-muted-foreground">The moment someone calls a decoy, they show up here and get blocked.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {attackers.map(([hex, hits]) => {
                const on = hex === selected?.[0]
                const last = hits[hits.length - 1]
                const blocked = !!quarantineOf(hex)
                return (
                  <li key={hex}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPick(hex)}
                      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', on ? 'bg-[#eeebe5] ring-1 ring-inset ring-foreground/20 dark:bg-[#2a2a2e]' : 'bg-muted/60 hover:bg-muted')}
                    >
                      <span className={cn('size-2.5 shrink-0 rounded-full', last.severity === 'critical' ? 'bg-destructive' : 'bg-warning')} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[13.5px] font-semibold">{shortId(hex)}</span>
                        <span className="block truncate text-[12.5px] text-muted-foreground">
                          {hits.length} trap call{hits.length === 1 ? '' : 's'} · {decoyLabel(last.decoy)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[12px] text-muted-foreground tabular-nums">
                        <span className={cn('block font-semibold', blocked ? 'text-destructive' : 'text-warning')}>{blocked ? 'Blocked' : 'Not blocked'}</span>
                        {ago(last.at.toDate(), now)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* picked attacker */}
        <Card title="Attacker details" className="lg:min-h-[420px]">
          {selected ? (
            <AttackerDetail hex={selected[0]} hits={selected[1]} q={quarantineOf(selected[0])} now={now} />
          ) : (
            <p className="text-[14.5px] text-muted-foreground">Pick an attacker to see who they are, every trap they touched, and what to do.</p>
          )}
        </Card>

        <TryIt /> {/* narrow column, under the list */}
        {/* traps + how to test */}
        <Card title="Traps" aside={`${DECOYS.length} armed · no real screen calls these`}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {DECOYS.map(d => {
              const hits = s.hitsByDecoy.get(d.name) ?? 0
              return (
                <li key={d.name} className="rounded-md bg-muted/60 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold">{d.label}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums', hits ? 'bg-destructive text-white' : 'bg-card text-muted-foreground')}>
                      {hits ? `${hits} hit${hits === 1 ? '' : 's'}` : 'Untouched'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{d.bait}</p>
                  <code className="mt-1 block font-mono text-[11.5px] text-muted-foreground/80">{d.name}</code>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
