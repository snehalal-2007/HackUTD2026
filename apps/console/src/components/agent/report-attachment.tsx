import { DownloadIcon, FileTextIcon } from 'lucide-react'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
import type { ReportAttachment as Report } from './types'

const ICON_REPORT = <FileTextIcon aria-hidden="true" />
const ICON_DOWNLOAD = <DownloadIcon aria-hidden="true" />

// A report the agent attaches to a reply (shift summaries, incident timelines).
// Download is disabled until the agent service produces real files.
export function ReportAttachment({ report }: { report: Report }) {
  return (
    <Attachment className="w-full max-w-sm">
      <AttachmentMedia>{ICON_REPORT}</AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{report.name}</AttachmentTitle>
        <AttachmentDescription>
          {report.kind}
          <span
            aria-hidden="true"
            className="mx-1.5 inline-block size-1 rounded-full bg-muted-foreground/40 align-middle"
          />
          {report.size}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          type="button"
          size="icon-sm"
          variant="secondary"
          disabled
          aria-label={`Download ${report.name} (available once the agent service is connected)`}
          title="Available once the agent service is connected"
        >
          {ICON_DOWNLOAD}
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  )
}
