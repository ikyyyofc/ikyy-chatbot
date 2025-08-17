// Cross-browser, robust text copy helper
// Tries async Clipboard API, then falls back to execCommand('copy').
export async function copyText(text = '') {
  const value = String(text ?? '')
  // Try modern async Clipboard API first
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {}

  // Fallback: create a temporary textarea and use execCommand('copy')
  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.width = '1px'
    ta.style.height = '1px'
    ta.style.opacity = '0'
    ta.style.pointerEvents = 'none'
    ta.style.zIndex = '-1'
    // Ensure selection is allowed even if app sets user-select: none
    ta.style.userSelect = 'text'
    document.body.appendChild(ta)

    const sel = document.getSelection?.()
    const prevRange = sel && sel.rangeCount ? sel.getRangeAt(0) : null

    ta.focus()
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')

    // Restore previous selection
    try {
      if (sel) {
        sel.removeAllRanges()
        if (prevRange) sel.addRange(prevRange)
      }
    } catch {}

    document.body.removeChild(ta)
    return !!ok
  } catch {}

  return false
}

