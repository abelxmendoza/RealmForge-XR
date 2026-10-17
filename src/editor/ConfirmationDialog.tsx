import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getConfirmation, resolveConfirmation, subscribeConfirmation } from '../world/confirmation'

export function ConfirmationDialog() {
  const request = useSyncExternalStore(subscribeConfirmation, getConfirmation, getConfirmation)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (request) dialog.current?.showModal()
    else dialog.current?.close()
  }, [request])
  return (
    <dialog ref={dialog} aria-labelledby="confirmation-title" onCancel={(e) => {
      e.preventDefault()
      if (request) resolveConfirmation(request.id, false)
    }}>
      <h2 id="confirmation-title">Confirm action</h2>
      <p>{request?.message}</p>
      <div className="row">
        <button autoFocus onClick={() => request && resolveConfirmation(request.id, false)}>Cancel</button>
        <button onClick={() => request && resolveConfirmation(request.id, true)}>Confirm</button>
      </div>
    </dialog>
  )
}
