import { ShieldAlertIcon, XIcon } from 'lucide-react'
import { shortId, useNewIntrusions } from './use-security'

/** Red bar on every page the moment a decoy is tripped after this browser loaded. */
export function IntrusionBanner({ onOpen }: { onOpen: () => void }) {
  const { fresh, dismiss } = useNewIntrusions()
  if (!fresh.length) return null
  const e = fresh[0]
  return (
    <div role="alert" className="mx-3.5 mt-3.5 flex items-center gap-3 rounded-lg bg-destructive px-4 py-2.5 text-[14.5px] text-white">
      <ShieldAlertIcon className="size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        <b className="font-semibold">Intrusion.</b> <span className="font-mono text-[13.5px]">{e.decoy}</span> was called by {shortId(e.identity.toHexString())}. The identity is quarantined.
        {fresh.length > 1 && ` (${fresh.length} new decoy calls)`}
      </span>
      <button type="button" onClick={() => { dismiss(); onOpen() }} className="shrink-0 rounded-md bg-white px-3 py-1 text-[13.5px] font-semibold text-destructive hover:bg-white/90">
        Open Security
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded-md p-1 hover:bg-white/15">
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
