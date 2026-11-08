import { Toaster as Sonner } from 'sonner'

/** The app's one toast container. Mount once, at the root. */
export function Toaster() {
  return <Sonner position="bottom-right" theme="dark" richColors closeButton visibleToasts={4} />
}
