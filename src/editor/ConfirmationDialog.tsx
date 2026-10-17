import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getConfirmation, resolveConfirmation, subscribeConfirmation } from '../world/confirmation'

export function ConfirmationDialog() {
  const request = useSyncExternalStore(subscribeConfirmation, getConfirmation, getConfirmation)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (request) dialog.current?.showModal()
    else dialog.current?.close()
  }, [request])
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
