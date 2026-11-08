import type { ViewId } from '@/components/shell/nav'

// Lets code outside the React tree that owns the current view (toasts, for now) ask the
// app to switch views. App listens for this event and calls its own navigate().
export const NAVIGATE_EVENT = 'mesa:navigate'

export function requestView(view: ViewId) {
  window.dispatchEvent(new CustomEvent<ViewId>(NAVIGATE_EVENT, { detail: view }))
}
