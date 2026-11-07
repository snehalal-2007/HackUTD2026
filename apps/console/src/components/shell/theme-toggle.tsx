import { useState } from 'react'
import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Theme = 'light' | 'dark'
const KEY = 'mesa:theme' // index.html reads the same key before first paint, so there's no flash

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Switches between dark quiet mode (default) and light mode; remembered per browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'

  function toggle() {
    document.documentElement.classList.toggle('dark', next === 'dark')
    setTheme(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // storage blocked: the choice lasts until reload
    }
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === 'dark' ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </Button>
  )
}
