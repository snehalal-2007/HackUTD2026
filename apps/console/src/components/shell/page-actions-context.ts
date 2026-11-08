import { createContext } from 'react'

/** The element on the right of the page header where a view can put its own controls (see PageActions). */
export const PageActionsContext = createContext<HTMLElement | null>(null)
