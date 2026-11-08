import type { ReactNode } from 'react'
import { FileTextIcon } from 'lucide-react'
import type { ThreadItem } from './use-agent-chat'

// The full content of an incident report the agent wrote, shown inline under its attachment in the chat.

type ReportItem = Extract<ThreadItem, { type: 'report' }>

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 text-[12.5px] font-semibold tracking-[.06em] text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  )
}

export function ReportView({ item }: { item: ReportItem }) {
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
