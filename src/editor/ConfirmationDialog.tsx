import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getConfirmation, resolveConfirmation, subscribeConfirmation } from '../world/confirmation'
import { useInXRSession } from '../xr/xrStore'

/**
 * The desktop confirmation. Not shown during an XR session: a modal <dialog> makes the rest of the page inert,
 * which also swallowed every XR pointer press, so the palette's own Confirm / Cancel could never be pressed and
 * the headset was stuck. The VR palette shows the same request; if you leave XR with one pending, this opens.
 */
export function ConfirmationDialog() {
  const request = useSyncExternalStore(subscribeConfirmation, getConfirmation, getConfirmation)
  const inXR = useInXRSession()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (request && !inXR) {
      if (!d.open) d.showModal()
    } else if (d.open) d.close()
  }, [request, inXR])
  const destructive = request?.type === 'DELETE' || /reset|replace|overwrite|delete|leave/i.test(request?.message ?? '')
  return (
    <dialog
      ref={dialog}
      aria-labelledby="confirmation-title"
      onCancel={(e) => {
        e.preventDefault()
        if (request) resolveConfirmation(request.id, false)
      }}
    >
      <div className="dialog-body">
        <h2 id="confirmation-title">{destructive ? 'Please confirm' : 'Confirm action'}</h2>
        <p>{request?.message}</p>
      </div>
      <div className="row">
        <button type="button" autoFocus onClick={() => request && resolveConfirmation(request.id, false)}>
          Cancel
        </button>
        <button
          type="button"
          className={destructive ? 'danger-confirm' : 'primary'}
          onClick={() => request && resolveConfirmation(request.id, true)}
        >
          Confirm
        </button>
      </div>
    </dialog>
  )
}
