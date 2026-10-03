/**
 * Copy to the clipboard. `navigator.clipboard` only exists in secure contexts and can be denied,
 * so there is always a fallback through a hidden textarea and `document.execCommand('copy')`.
 */

function legacyCopy(text: string): boolean {
  const active = document.activeElement as HTMLElement | null
  const selection = document.getSelection()
  const saved = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.style.cssText = 'position:fixed;top:0;inset-inline-start:0;width:1px;height:1px;opacity:0;'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  area.remove()

  // Leave the page as it was: the user's selection and the focused control.
  if (saved && selection) {
    selection.removeAllRanges()
    selection.addRange(saved)
  }
  active?.focus?.()
  return copied
}

export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* permission denied or document not focused: try the fallback */
    }
  }
  return legacyCopy(text)
}

/** Copy a PNG. There is no fallback for images: the caller offers a download instead. */
export async function copyImage(blob: Blob): Promise<boolean> {
  if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return false
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return true
  } catch {
    return false
  }
}
