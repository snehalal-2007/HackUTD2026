import { BotIcon, XIcon } from 'lucide-react'
import { AgentChat } from '@/components/agent/agent-chat'
import { Button } from '@/components/ui/button'
import { suggestionsFor } from './suggestions'
import type { ShiftReportData } from './types'

/**
 * The optional right-hand panel: the existing agent chat, unchanged in what it may do (it reads, it never acts, and
 * everything it writes is labeled AI drafted). It answers from the live database, so on a sample shift it is
 * switched off rather than allowed to answer a different shift's question with live numbers.
 */
export function AgentPanel({ report, onClose }: { report: ShiftReportData; onClose: () => void }) {
  const live = report.kind === 'live'
  return (
    <div className="handoff-panel-in flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-start gap-2 border-b px-3 py-2.5">
        <BotIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">Ask about this shift</h2>
          <p className="text-xs text-muted-foreground">Reads live telemetry, incidents and the log. It cannot change anything. Answers are AI drafted.</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close the agent panel">
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      {live ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <AgentChat compact suggestions={suggestionsFor(report)} />
        </div>
      ) : (
        <div className="p-4 text-sm">
          <p className="font-medium">The agent cannot answer about a sample shift.</p>
          <p className="mt-1 text-muted-foreground">It reads the live database, and this shift is made up for illustration, so any answer would mix real numbers into a made-up report. Switch to “This shift (live)” to ask about real data.</p>
        </div>
      )}
    </div>
  )
}
