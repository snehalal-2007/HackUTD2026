import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpacetimeDBProvider } from 'spacetimedb/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/notify/toaster'
import { connectionBuilder } from '@/lib/spacetime'
import App from './App.tsx'
import { interceptLinks, upgradeHashUrl } from '@/lib/route'
import './index.css'

upgradeHashUrl() // old /#/… links become real paths
interceptLinks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
      <Toaster />
    </SpacetimeDBProvider>
  </StrictMode>,
)
