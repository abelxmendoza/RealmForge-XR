/**
 * Leave the editor and return to the project landing page (`?`).
 * Used by the Home link and the "go home" voice escape hatch.
 */

export const HOME_HREF = '?'

/** Navigate back to the landing page. Page unload ends any XR session. */
export function leaveEditor() {
  if (typeof window === 'undefined') return
  window.location.assign(HOME_HREF)
}
