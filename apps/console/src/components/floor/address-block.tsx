import { cn } from '@/lib/utils'

/**
 * The address block (docs/location-designs-7.html #2): the block big, in the severity colour, then the floor, then
 * the site, set apart from the alert by a thin line. Severity is also written in the alert, so colour isn't alone.
 */
export function AddressBlock({ block, floor, site, severity, className }: { block: string; floor: number; site: string; severity: string; className?: string }) {
  const tone = severity === 'critical' ? 'text-destructive' : severity === 'high' || severity === 'medium' ? 'text-warning' : 'text-foreground'
  return (
    <div className={cn('w-[96px] shrink-0 border-r pr-3.5', className)} aria-label={`Block ${block}, floor ${floor}, ${site}`}>
      <div className={cn('text-[24px] leading-none font-bold tracking-tight', tone, block.length > 3 && 'text-[17px]')}>{block}</div>
      <div className="mt-1.5 text-[12.5px] font-semibold">Floor {floor}</div>
      <div className="truncate text-[11.5px] text-muted-foreground" title={site}>{site}</div>
    </div>
  )
}
