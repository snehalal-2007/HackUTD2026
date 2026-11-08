import { cn } from '@/lib/utils'

// The MESA mark (docs/brand/mesa-mark.svg) on currentColor, so it follows the sidebar's colors.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center text-sidebar-foreground', // no tile: the mark itself in ink (black in light mode)
        className,
      )}
    >
      <MesaGlyph className="size-7!" />
    </span>
  )
}

/** The bare MESA mark: just the svg on currentColor, sized by the caller. */
export function MesaGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn('shrink-0', className)} fill="currentColor" aria-hidden="true">
      <path d="M36 4 Q30 46 4 50 Q30 54 36 96Z" />
      <path d="M64 4 Q70 46 96 50 Q70 54 64 96Z" />
      <path d="M50 4 Q53 46 64.4 50 Q53 54 50 96 Q47 54 35.6 50 Q47 46 50 4Z" />
    </svg>
  )
}
