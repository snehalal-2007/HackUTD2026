import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** One titled block of the report. The `id` ties the heading to the section for screen readers. */
export function Section({ id, title, aside, children, className }: { id: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** A small stat: label above, big number, note below. */
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
    </li>
  )
}
