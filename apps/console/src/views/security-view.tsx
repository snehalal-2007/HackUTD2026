import { useState, type ReactNode } from 'react'
import { BanIcon, ShieldAlertIcon, ShieldCheckIcon, TerminalIcon, WrenchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DECOYS, ago, clock, shortId, useNow, useSecurity, type ThreatEvent } from '@/components/security/use-security'

// Honeypot overview, live from the `threat_event` and `quarantine` tables (module/src/honeypot).

const ATTACK_CMD = 'pnpm demo:attack' // root script: runs security/attack-scripts/attack-demo.ts with tsx

function Severity({ value }: { value: string }) {
  const crit = value === 'critical'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 text-[13px] leading-tight font-semibold whitespace-nowrap capitalize', crit ? 'text-destructive' : 'text-warning')}>
      <span aria-hidden="true">{crit ? '◆' : '▲'}</span>
      {value}
    </span>
  )
}

function Tile({ k, v, sub, dark }: { k: string; v: ReactNode; sub?: string; dark?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-center gap-1 rounded-lg px-4 py-3', dark ? 'bg-[#18181b] text-white dark:bg-[#f4f4f5] dark:text-[#18181b]' : 'bg-card')}>
      <span className={cn('text-[12.5px]', dark ? 'opacity-70' : 'text-muted-foreground')}>{k}</span>
      <span className="truncate text-2xl font-semibold tabular-nums">{v}</span>
      {sub && <span className={cn('truncate text-[12.5px]', dark ? 'opacity-70' : 'text-muted-foreground')}>{sub}</span>}
    </div>
  )
}

function Card({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-h-0 flex-col rounded-lg bg-card p-5', className)} aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15.5px] font-semibold">{title}</h2>
        {aside && <span className="text-[13px] text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Field({ k, children, mono }: { k: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted-foreground">{k}</div>
      <div className={cn('mt-0.5 text-[15px] font-medium', mono && 'font-mono text-[13.5px] break-all')}>{children}</div>
    </div>
  )
}

function TryIt() {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted px-4 py-3.5 text-[14.5px]">
      <span className="flex items-center gap-2 font-semibold"><TerminalIcon className="size-4" aria-hidden="true" /> Test it</span>
      <span className="text-muted-foreground">From the repo root, with the local database running, play the attacker:</span>
      <code className="w-fit rounded bg-card px-2 py-1 font-mono text-[13px] select-all">{ATTACK_CMD}</code>
    </div>
  )
}

function Detail({ event, all, now }: { event: ThreatEvent; all: ThreatEvent[]; now: number }) {
  const hex = event.identity.toHexString()
  const same = all.filter(e => e.identity.isEqual(event.identity) && e.id !== event.id)
  const at = event.at.toDate()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[13px] text-muted-foreground">Event #{String(event.id)} · {event.kind.replace('-', ' ')}</div>
        <p className="mt-1 mb-2 text-[17px] leading-snug font-semibold">{event.summary}</p>
        <Severity value={event.severity} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2"><Field k="Decoy called" mono>{event.decoy}</Field></div>
        <Field k="Hit from this identity">#{event.hitNumber}</Field>
        <Field k="When">{clock(at)} <span className="font-normal text-muted-foreground">· {ago(at, now)}</span></Field>
        <Field k="Connection" mono>{shortId(event.connectionId)}</Field>
        <div className="col-span-2"><Field k="Identity" mono>{hex}</Field></div>
      </div>
      <div className="flex gap-2.5 rounded-md bg-muted px-3.5 py-3 text-[14.5px] leading-normal">
        <WrenchIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div><b className="font-semibold">Suggested fix.</b> {event.suggestedFix}</div>
      </div>
      {same.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold tracking-[.06em] text-muted-foreground uppercase">Other hits from this identity</h3>
          <ul>
            {same.map(e => (
              <li key={String(e.id)} className="flex justify-between gap-3 border-b py-2 text-[14px] last:border-b-0">
                <span className="font-mono text-[13px]">{e.decoy}</span>
                <span className="text-muted-foreground tabular-nums">#{e.hitNumber} · {clock(e.at.toDate())}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function SecurityView() {
  const s = useSecurity()
  const now = useNow()
  const [pick, setPick] = useState<bigint | null>(null)
  const selected = s.events.find(e => e.id === pick) ?? s.latest
  const breached = s.events.length > 0
  const attackers = s.quarantined.length

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-3.5 p-3.5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {s.meQuarantined && (
          <div role="alert" className="flex items-center gap-3 rounded-lg bg-destructive px-5 py-3 text-[15px] text-white lg:col-span-2">
            <BanIcon className="size-5 shrink-0" aria-hidden="true" />
            This browser's identity is quarantined after {s.meQuarantined.hits} decoy hit{s.meQuarantined.hits === 1 ? '' : 's'}. Real actions from here will be rejected.
          </div>
        )}

        {/* status + totals */}
        <div className="grid gap-3.5 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_repeat(4,150px)]">
          <div className={cn('flex items-center gap-4 rounded-lg px-5 py-4', breached ? 'bg-destructive/10 text-foreground ring-1 ring-destructive/40' : 'bg-card')}>
            <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', breached ? 'bg-destructive text-white' : 'bg-success/15 text-success')}>
              {breached ? <ShieldAlertIcon className="size-6" aria-hidden="true" /> : <ShieldCheckIcon className="size-6" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{!s.ready ? 'Connecting to the honeypot…' : breached ? 'Intrusion detected' : 'All clear'}</h1>
              <p className="text-[15px] text-muted-foreground">
                {!s.ready
                  ? 'Waiting for the threat_event and quarantine tables.'
                  : breached
                    ? `${attackers} identit${attackers === 1 ? 'y' : 'ies'} tripped ${s.events.length} decoy call${s.events.length === 1 ? '' : 's'} and ${attackers === 1 ? 'is' : 'are'} quarantined: every real reducer now rejects ${attackers === 1 ? 'it' : 'them'}.`
                    : `${DECOYS.length} decoys are armed. Nobody has touched them.`}
              </p>
            </div>
          </div>
          <Tile k="Decoy calls" v={s.events.length} />
          <Tile k="Quarantined" v={attackers} sub={attackers ? 'identities blocked' : undefined} />
          <Tile k="Decoys armed" v={DECOYS.length} />
          <Tile k="Last intrusion" v={s.latest ? clock(s.latest.at.toDate()) : 'None'} sub={s.latest ? ago(s.latest.at.toDate(), now) : undefined} dark />
        </div>

        {/* live feed */}
        <Card title="Intrusion feed" aside={breached ? 'Live · newest first' : 'Live'} className="lg:min-h-[420px]">
          {!breached ? (
            <div className="flex flex-col gap-4">
              <p className="text-[15px] text-muted-foreground">No decoys tripped yet. Each call to a decoy reducer shows up here the moment it happens.</p>
              <TryIt />
            </div>
          ) : (
            <ol className="-mx-2 flex flex-col">
              {s.events.map(e => {
                const on = e.id === selected?.id
                return (
                  <li key={String(e.id)}>
                    <button
                      type="button"
                      onClick={() => setPick(e.id)}
                      aria-pressed={on}
                      className={cn('grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-muted', on && 'bg-muted')}
                    >
                      <span aria-hidden="true" className={cn('size-2.5 rounded-full', e.severity === 'critical' ? 'bg-destructive' : 'bg-warning')} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{e.decoy}</span>
                        <span className="block truncate text-[13.5px] text-muted-foreground">
                          {shortId(e.identity.toHexString())} · hit #{e.hitNumber} · {e.kind.replace('-', ' ')}
                        </span>
                      </span>
                      <span className="text-right text-[13px] text-muted-foreground tabular-nums">
                        {clock(e.at.toDate())}
                        <span className="block">{ago(e.at.toDate(), now)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>

        {/* selected event */}
        <Card title="Event detail" className="lg:min-h-[420px]">
          {selected ? <Detail event={selected} all={s.events} now={now} /> : <p className="text-[15px] text-muted-foreground">Pick an event in the feed to see who called which decoy, and what to do about it.</p>}
        </Card>

        {/* quarantine */}
        <Card title="Quarantined identities" aside={`${attackers} blocked`}>
          {attackers === 0 ? (
            <p className="text-[15px] text-muted-foreground">Nobody is quarantined.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead className="text-[13px] text-muted-foreground">
                  <tr className="border-b"><th className="py-2 pr-3 font-medium">Identity</th><th className="py-2 pr-3 font-medium">Reason</th><th className="py-2 pr-3 text-right font-medium">Hits</th><th className="py-2 text-right font-medium">Since</th></tr>
                </thead>
                <tbody>
                  {s.quarantined.map(q => (
                    <tr key={q.identity.toHexString()} className="border-b last:border-b-0">
                      <td className="py-2.5 pr-3 font-mono text-[13px]" title={q.identity.toHexString()}>{shortId(q.identity.toHexString())}</td>
                      <td className="py-2.5 pr-3">{q.reason}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{q.hits}</td>
                      <td className="py-2.5 text-right whitespace-nowrap text-muted-foreground tabular-nums">{clock(q.at.toDate())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* decoys */}
        <Card title="Decoys" aside="Traps that look real">
          <ul className="flex flex-col">
            {DECOYS.map(d => {
              const hits = s.hitsByDecoy.get(d.name) ?? 0
              return (
                <li key={d.name} className="flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[13.5px] font-medium">{d.name}</div>
                    <div className="text-[13px] text-muted-foreground">{d.bait}</div>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold tabular-nums', hits ? 'bg-destructive text-white' : 'bg-muted text-muted-foreground')}>
                    {hits ? `${hits} hit${hits === 1 ? '' : 's'}` : 'Untouched'}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
