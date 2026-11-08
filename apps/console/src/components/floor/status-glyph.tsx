import { cn } from '@/lib/utils'

/**
 * Severity/status shapes drawn at one fixed size (◆ critical, ▲ high/warning, ● ok/low). The text characters
 * render at different sizes in every font, so these are drawn instead. They take the text colour (currentColor).
 */
export function StatusGlyph({ shape, className }: { shape: 'diamond' | 'triangle' | 'dot'; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={cn('size-2.5 shrink-0', className)} aria-hidden="true" fill="currentColor">
      {shape === 'diamond' && <path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" />}
      {shape === 'triangle' && <path d="M5 0.8 9.6 9.2H0.4Z" />}
      {shape === 'dot' && <circle cx="5" cy="5" r="3.6" />}
    </svg>
  )
}
