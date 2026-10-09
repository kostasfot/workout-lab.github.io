import { useEffect, useState } from 'react'

export function useViewport() {
  const read = () => ({ width: innerWidth, layoutHeight: innerHeight, height: window.visualViewport?.height ?? innerHeight, top: window.visualViewport?.offsetTop ?? 0, keyboard: false })
  const [viewport, setViewport] = useState(read)
  useEffect(() => {
    const update = () => setViewport(previous => {
      const next = read(), element = document.activeElement
      const editing = element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && ['number', 'text', 'email', 'password', 'search', 'tel', 'url'].includes(element.type))
      // Keep the panel structure stable while a touch keyboard resizes the layout viewport.
      // VisualViewport still supplies the available space for the focused editor.
      const touchShrink = matchMedia('(pointer: coarse)').matches && next.width === previous.width && next.height < previous.layoutHeight - 120 && (editing || previous.keyboard)
      const layoutHeight = touchShrink ? Math.max(previous.layoutHeight, next.layoutHeight) : next.layoutHeight
      const keyboard = (editing || previous.keyboard) && (window.visualViewport?.scale ?? 1) === 1 && next.height < layoutHeight - 120
      return { ...next, layoutHeight, keyboard }
    })
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => { window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update) }
  }, [])
  return { ...viewport, compact: viewport.width < 680, short: viewport.layoutHeight < 520 }
}
