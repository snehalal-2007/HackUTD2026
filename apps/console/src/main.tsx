import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpacetimeDBProvider } from 'spacetimedb/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { connectionBuilder } from '@/lib/spacetime'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </SpacetimeDBProvider>
  </StrictMode>,
)
