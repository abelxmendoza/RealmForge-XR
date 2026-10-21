import { useEffect, useRef, useState, type ReactNode } from 'react'
import { loadAuthBackend } from '../backend'
import { useAuth } from '../store'
import { ROLE_LABEL, roleTitle, type Capability } from '../roles'
import './auth.css'

let started = false
/** Start auth once per page (also completes a magic-link sign-in: ?code=… in the URL). */
export function useAuthInit() {
  useEffect(() => {
    if (started) return
    started = true
    void loadAuthBackend().then((b) => useAuth.getState().init(b)).catch((e: Error) => {
      console.error('[auth] could not start', e)
      return useAuth.getState().init(null)
    }).then(() => {
      const url = new URL(window.location.href)
      if (url.searchParams.has('code')) { url.searchParams.delete('code'); history.replaceState(null, '', url) }
    })
  }, [])
}

/** Where magic links return to: the current page without auth params. */
export function redirectUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.hash = ''
  return url.toString()
}

export function SignInForm({ onDone }: { onDone?: () => void }) {
  const { sendMagicLink, verifyCode, linkSentTo, error, status } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (status === 'signed-in') onDone?.() }, [status, onDone])
  if (status === 'disabled') return <p className="au-note">Sign-in isn’t configured on this deployment. Everything else works as a guest.</p>
  if (linkSentTo) {
    return (
      <form className="au-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await verifyCode(code); setBusy(false) }}>
        <p>Check <strong>{linkSentTo}</strong> for a sign-in link. Open it on this device.</p>
        <label>On a headset or another device? Enter the code from the email instead
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
        </label>
        <button type="submit" disabled={busy || !code}>Verify code</button>
        {error && <p className="au-error" role="alert">{error}</p>}
      </form>
    )
  }
  return (
    <form className="au-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await sendMagicLink(email, redirectUrl()); setBusy(false) }}>
      <label>Email
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
      <small>No password. New here? The same link creates your account.</small>
      {error && <p className="au-error" role="alert">{error}</p>}
    </form>
  )
}

/** Header control: "Sign in" for guests, account menu with role badges when signed in. */
export function AccountMenu({ className = '' }: { className?: string }) {
  useAuthInit()
  const { status, user, roles, profile, signOut, can } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  if (status === 'disabled' || status === 'loading') return null
  return (
    <div className={`au-menu ${className}`} ref={ref}>
      <button type="button" className="au-trigger" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        {status === 'signed-in' ? (profile?.display_name || user?.email?.split('@')[0]) : 'Sign in'}
        {roles.includes('admin') && <span className="au-badge au-admin">Admin</span>}
      </button>
      {open && (
        <div className="au-pop" role="dialog" aria-label={status === 'signed-in' ? 'Account' : 'Sign in'}>
          {status === 'signed-in' ? (
            <>
              <p className="au-who">{user?.email}<br /><span>{roleTitle(roles)}</span></p>
              <div className="au-badges">{roles.filter((r) => r !== 'member').map((r) => <span key={r} className={`au-badge au-${r}`}>{ROLE_LABEL[r]}</span>)}</div>
              <nav className="au-links">
                {can('view-users') && <a href="?admin=1">{can('manage-roles') ? 'Admin: users & roles' : 'Team & roles'}</a>}
                {can('creative-studio') && <a href="?studio=1">Creative Studio</a>}
                <a href="?editor=1">World editor</a>
              </nav>
              <button type="button" onClick={() => { void signOut(); setOpen(false) }}>Sign out</button>
            </>
          ) : <SignInForm onDone={() => setOpen(false)} />}
        </div>
      )}
    </div>
  )
}

/**
 * Page gate for role-restricted pages. In guest mode (no auth configured, e.g. an offline demo
 * laptop) it lets the page through with a notice, because there is nobody to check against; the
 * real protection for privileged data is row-level security in the database.
 */
export function RequireCapability({ cap, title, children }: { cap: Capability; title: string; children: ReactNode }) {
  useAuthInit()
  const { status, can, roles } = useAuth()
  if (status === 'loading') return <div className="au-gate"><p role="status">Checking your account…</p></div>
  if (status === 'disabled') return <>{children}</>
  if (status === 'signed-in' && can(cap)) return <>{children}</>
  return (
    <div className="au-gate">
      <div className="au-card">
        <h1>{title}</h1>
        {status === 'signed-out'
          ? <><p>Sign in to continue.</p><SignInForm /></>
          : <p>Your account ({roleTitle(roles)}) doesn’t have access to this page. Ask the admin.</p>}
        <a href="?">Back to RealmForge XR</a>
      </div>
    </div>
  )
}
