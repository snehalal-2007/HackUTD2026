import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PageActionsContext } from './page-actions-context'

/** Renders its children on the right of the page header (e.g. the Log and Alerts location filter). */
export function PageActions({ children }: { children: ReactNode }) {
  const el = useContext(PageActionsContext)
  return el ? createPortal(children, el) : null
}
