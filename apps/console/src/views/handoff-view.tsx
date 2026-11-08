import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BotIcon, DownloadIcon, LoaderCircleIcon } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { AgentPanel } from '@/components/handoff/agent-panel'
import { useCostAssumptions } from '@/components/handoff/cost-model'
import { printReport } from '@/components/handoff/print'
import { ShiftReport } from '@/components/handoff/report'
import { SAMPLE_SHIFTS } from '@/components/handoff/sample-shifts'
import { useLiveShift } from '@/components/handoff/use-live-shift'
import type { ShiftReportData } from '@/components/handoff/types'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Shift Handoff: what happened on the last shift, in plain words, and what the incoming operator must do next.
// The live tab is read from SpacetimeDB; the three earlier shifts are labeled sample fixtures (docs/SHIFT-HANDOFF.md).

const WIDE = '(min-width: 1024px)'
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const isWide = () => window.matchMedia(WIDE).matches

export function HandoffView() {
  const [tab, setTab] = useState('live')
  const [panelOpen, setPanelOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true)
  const assumptions = useCostAssumptions()
  const { report: live, ready } = useLiveShift(tab === 'live')
  const reportRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Each shift is its own page: start at the top when switching (instantly, no scrolling animation).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [tab])

  const shifts = useMemo<ShiftReportData[]>(() => [live, ...SAMPLE_SHIFTS], [live])
  const current = shifts.find(s => s.id === tab) ?? live

  async function download() {
    if (!reportRef.current) return
    setError('')
    setPrinting(true)
    try {
      await printReport(reportRef.current, `MESA shift report: ${current.title}${current.kind === 'sample' ? ' (sample, illustrative)' : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPrinting(false)
    }
  }

  const panel = <AgentPanel report={current} onClose={() => setPanelOpen(false)} />

  return (
    <Tabs.Root value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2" data-noprint>
        <Tabs.List aria-label="Choose a shift" className="flex max-w-full gap-1 overflow-x-auto">
          {shifts.map(s => (
            <Tabs.Trigger
              key={s.id}
              value={s.id}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap outline-none transition-colors',
                'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                'data-[state=active]:bg-muted data-[state=active]:font-medium',
              )}
            >
              {s.tabLabel.replace(' (live)', '')}
              <span className="rounded-sm border px-1 text-[10px] leading-4 uppercase tracking-wide text-muted-foreground">{s.kind === 'live' ? 'Live' : 'Sample'}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" aria-expanded={panelOpen} aria-controls="handoff-agent-panel" onClick={() => setPanelOpen(o => !o)}>
            <BotIcon aria-hidden="true" />
            {panelOpen ? 'Hide agent' : 'Ask the agent'}
          </Button>
          <Button type="button" size="sm" onClick={() => void download()} disabled={printing || (tab === 'live' && !ready)}>
            {printing ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <DownloadIcon aria-hidden="true" />}
            Download PDF
          </Button>
        </div>
        {error && (
          <p role="alert" className="w-full text-xs text-destructive">
            Could not open the print dialog: {error}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
          <Tabs.Content value={current.id} className="px-4 py-5 outline-none" tabIndex={-1}>
            {current.kind === 'live' && !ready ? (
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-3" aria-busy="true">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <ShiftReport ref={reportRef} report={current} assumptions={assumptions} />
            )}
            <p className="mx-auto mt-4 w-full max-w-5xl text-xs text-muted-foreground" data-noprint>
              Download PDF opens your browser’s print dialog. Choose “Save as PDF” as the destination.
            </p>
          </Tabs.Content>
        </div>

        {panelOpen && wide && (
          <aside id="handoff-agent-panel" aria-label="Agent chat" className="flex w-[400px] shrink-0 border-l bg-background" data-noprint>
            {panel}
          </aside>
        )}
      </div>

      {!wide && (
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-md" id="handoff-agent-panel">
            <SheetTitle className="sr-only">Ask the agent about this shift</SheetTitle>
            <SheetDescription className="sr-only">The agent reads live data and cannot change anything. Answers are AI drafted.</SheetDescription>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </Tabs.Root>
  )
}
