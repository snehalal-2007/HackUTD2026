import { useEffect, useState } from 'react'
import { Toaster as Sonner } from 'sonner'

const current = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')

/** The app's one toast container. Mount once, at the root. Follows the console's light/dark theme toggle. */
export function Toaster() {
  const [theme, setTheme] = useState<'light' | 'dark'>(current)
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(current()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  // Unstyled: every toast is drawn by the .mesa-toast rules in index.css (white card, coloured bottom accent,
  // the status written above the title). Callers can pass className 'sev-critical' | 'sev-high' | … to label by severity.
  return (
    <Sonner
      position="bottom-right"
      theme={theme}
      closeButton
      visibleToasts={4}
      toastOptions={{
        unstyled: true,
        classNames: { toast: 'mesa-toast', title: 'mesa-toast-title', description: 'mesa-toast-desc', actionButton: 'mesa-toast-action', closeButton: 'mesa-toast-close' },
      }}
    />
  )
}
