import { useCallback, useEffect, useState } from 'react'
import type { AuditEntry, UserWithRoles } from '../backend'
import { useAuth } from '../store'
import { canChangeRole, GRANTABLE, ROLE_LABEL, roleTitle, type Role } from '../roles'
import { AccountMenu, RequireCapability } from './AuthUI'

/**
 * ?admin=1 — team & roles. Founders see the user list and audit log; only the admin can grant or
 * revoke Founder / Developer. Every change goes through the database's admin-only, audited
 * grant_role / revoke_role functions; the buttons here are only a convenience.
 */
export default function AdminApp() {
  return (
    <RequireCapability cap="view-users" title="Team & roles">
      <AdminPage />
    </RequireCapability>
  )
}

function AdminPage() {
  const me = useAuth()
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const backend = useAuth((s) => s.backend)

  const load = useCallback(async () => {
    if (!backend) return
    try {
      const [u, a] = await Promise.all([backend.listUsers(), backend.audit(50)])
      setUsers(u); setAudit(a); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [backend])
  useEffect(() => { void load() }, [load])

  const toggle = async (u: UserWithRoles, role: Role) => {
    if (!backend) return
    const has = u.roles.includes(role)
    if (has && u.id === me.user?.id && !confirm(`Remove ${ROLE_LABEL[role]} from your own account?`)) return
    setBusy(`${u.id}:${role}`)
    try {
      await (has ? backend.revoke(u.id, role) : backend.grant(u.id, role))
      await load()
      if (u.id === me.user?.id) await me.reload()
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const emailOf = (id: string | null) => (id ? users.find((u) => u.id === id)?.email ?? id.slice(0, 8) : 'system')
  const shown = users.filter((u) => !filter || u.email.includes(filter.toLowerCase()) || (u.display_name ?? '').toLowerCase().includes(filter.toLowerCase()))
  const manage = me.can('manage-roles')

  if (!backend) return <div className="au-page"><p>Sign-in isn’t configured, so there are no accounts to manage.</p></div>

  return (
    <div className="au-page">
      <header className="au-head">
        <a href="?" className="au-brand">RealmForge XR</a>
        <h1>{manage ? 'Admin · users & roles' : 'Team & roles'}</h1>
        <AccountMenu />
      </header>
      {!manage && <p className="au-note">You can see the team. Only the admin can change roles.</p>}
      {error && <p className="au-error" role="alert">{error}</p>}
      <section className="au-section">
        <div className="au-row">
          <h2>Users ({users.length})</h2>
          <input type="search" placeholder="Filter by email or name" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter users" />
          <button type="button" onClick={() => void load()}>Refresh</button>
        </div>
        <table className="au-table">
          <thead><tr><th>Account</th><th>Roles</th>{GRANTABLE.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}<th>Joined</th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} data-testid="user-row">
                <td><strong>{u.display_name || u.email.split('@')[0]}</strong><br /><small>{u.email}{u.id === me.user?.id ? ' (you)' : ''}</small></td>
                <td>{roleTitle(u.roles)}</td>
                {GRANTABLE.map((r) => (
                  <td key={r}>
                    <label className="au-switch">
                      <input type="checkbox" checked={u.roles.includes(r)} disabled={!canChangeRole(me.roles, r) || busy !== null}
                        onChange={() => void toggle(u, r)} aria-label={`${ROLE_LABEL[r]} for ${u.email}`} />
                      <span>{u.roles.includes(r) ? 'Yes' : 'No'}</span>
                    </label>
                  </td>
                ))}
                <td><small>{new Date(u.created_at).toLocaleDateString()}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="au-note">People appear here after they sign in once. The admin role belongs to one account and can’t be changed from the app.</p>
      </section>
      <section className="au-section">
        <h2>Role changes</h2>
        <table className="au-table">
          <thead><tr><th>When</th><th>Who</th><th>Change</th><th>Account</th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}><td><small>{new Date(a.at).toLocaleString()}</small></td><td>{emailOf(a.actor)}</td><td>{a.action} {ROLE_LABEL[a.role]}</td><td>{emailOf(a.target)}</td></tr>
            ))}
            {!audit.length && <tr><td colSpan={4}><small>No changes yet.</small></td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  )
}
