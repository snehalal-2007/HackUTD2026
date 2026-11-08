import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './intro.css'

type Variant = 'up' | 'left' | 'right' | 'scale' | 'blur'

/** Fades its children in (with a slide, scale or blur) the first time they scroll into view. */
export function Reveal({
  children,
  variant = 'up',
  delay = 0,
  as: Tag = 'div',
  className,
}: {
  children: ReactNode
  variant?: Variant
  delay?: number
  as?: ElementType
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.setAttribute('data-shown', '')
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref} data-v={variant} className={cn('reveal', className)} style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  )
}

/** Splits a line into words that rise in one after another. */
export function RiseText({ text, className, start = 0, step = 70 }: { text: string; className?: string; start?: number; step?: number }) {
  return (
    <span className={cn('rise', className)} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} aria-hidden="true" style={{ animationDelay: `${start + i * step}ms` }}>
          {w}&nbsp;
        </span>
      ))}
    </span>
  )
}
