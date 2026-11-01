/** Keep native touch zoom out of the app without intercepting editor gesture handlers. */
export function startWorkspacePinchZoom(doc: Document = document): () => void {
  const preventGesture = (event: Event) => {
    if (event.cancelable) event.preventDefault()
  }
  const preventPinch = (event: TouchEvent) => {
    if (event.touches.length > 1) preventGesture(event)
  }
  const options = { passive: false }
  doc.addEventListener('touchstart', preventPinch, options)
  doc.addEventListener('touchmove', preventPinch, options)
  // Safari can expose native magnification through GestureEvents as well as touches.
  doc.addEventListener('gesturestart', preventGesture, options)
  doc.addEventListener('gesturechange', preventGesture, options)
  return () => {
    doc.removeEventListener('touchstart', preventPinch)
    doc.removeEventListener('touchmove', preventPinch)
    doc.removeEventListener('gesturestart', preventGesture)
    doc.removeEventListener('gesturechange', preventGesture)
  }
}
