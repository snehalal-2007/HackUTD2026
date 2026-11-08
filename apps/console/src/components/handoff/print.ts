// "Download PDF" without a PDF library: copy the report into a hidden frame that has no dark theme, wait for its
// styles and fonts, and call print(). The browser's print dialog then offers "Save as PDF".
//
// Why a frame and not @media print on the page itself: the console shell clips its content to the window height
// (h-dvh, overflow hidden), so a report taller than the window would print as one page. The frame is a plain
// document, so it paginates normally, and because it has no `dark` class on <html> every colour token resolves to its
// light value: the page is white even though the console is dark.

const FRAME_ID = 'mesa-handoff-print-frame'

/** Remove anything marked data-noprint (tabs, buttons, edit fields) and anything that is a live control. */
function cleanClone(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-noprint]').forEach(el => el.remove())
  clone.querySelectorAll('button, input').forEach(el => el.setAttribute('tabindex', '-1'))
  // Charts scale to the page width through their viewBox; cap the scale-up so labels stay a sensible size.
  clone.querySelectorAll<SVGSVGElement>('svg.recharts-surface').forEach(svg => {
    const w = Number(svg.getAttribute('width'))
    if (w > 0) svg.style.setProperty('max-width', `${Math.round(w * 1.5)}px`, 'important')
  })
  return clone
}

function stylesOf(doc: Document): string {
  const parts: string[] = []
  doc.querySelectorAll('link[rel="stylesheet"], style').forEach(el => {
    if (el instanceof HTMLLinkElement) parts.push(`<link rel="stylesheet" href="${el.href}">`)
    else parts.push(`<style>${el.textContent ?? ''}</style>`)
  })
  return parts.join('\n')
}

function cleanup() {
  document.getElementById(FRAME_ID)?.remove()
}

/** Prints `root` as a white document. Resolves when the print dialog has been requested. */
export async function printReport(root: HTMLElement, title: string): Promise<void> {
  cleanup()
  const frame = document.createElement('iframe')
  frame.id = FRAME_ID
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // Off-screen but laid out at a realistic A4 content width, so responsive classes pick the same layout as paper.
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden'
  const clone = cleanClone(root)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${stylesOf(document)}</head><body class="print-doc">${clone.outerHTML}</body></html>`

  await new Promise<void>((resolve, reject) => {
    frame.addEventListener('load', () => resolve(), { once: true })
    frame.addEventListener('error', () => reject(new Error('The print frame failed to load')), { once: true })
    frame.srcdoc = html // srcdoc inherits this page's base URL, so stylesheet and font URLs resolve
    document.body.appendChild(frame)
  })

  const win = frame.contentWindow
  if (!win) {
    cleanup()
    throw new Error('The print frame is not available')
  }
  try {
    await win.document.fonts?.ready
  } catch {
    // Fonts API missing: print with what has loaded.
  }
  // One frame for layout (chart SVGs rescale to the page width) before the dialog opens.
  await new Promise(r => win.requestAnimationFrame(() => r(null)))
  win.addEventListener('afterprint', cleanup, { once: true })
  win.focus()
  win.print()
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}
