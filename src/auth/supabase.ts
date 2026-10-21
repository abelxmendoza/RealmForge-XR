/** Supabase implementation of AuthBackend (loaded lazily by loadAuthBackend). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeRoles } from './roles.ts'
import type { AuditEntry, AuthBackend, AuthUser, Profile } from './backend.ts'

export function createSupabaseBackend(url: string, key: string): AuthBackend {
  return supabaseBackend(createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } }))
}

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export function supabaseBackend(client: SupabaseClient): AuthBackend {
  const toUser = (u: { id: string; email?: string } | null | undefined): AuthUser | null => (u ? { id: u.id, email: u.email ?? '' } : null)
  return {
    async currentUser() {
      const { data } = await client.auth.getSession()
      return toUser(data.session?.user)
    },
    onChange(cb) {
      // Deferred: calling Supabase inside this callback can deadlock the auth lock (supabase-js docs).
      const { data } = client.auth.onAuthStateChange((_e, session) => { setTimeout(() => cb(toUser(session?.user)), 0) })
      return () => data.subscription.unsubscribe()
    },
    async sendMagicLink(email, redirectTo) {
      fail((await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } })).error)
    },
    async verifyCode(email, code) {
      fail((await client.auth.verifyOtp({ email, token: code, type: 'email' })).error)
    },
    async signOut() { fail((await client.auth.signOut()).error) },
    async myRoles(userId) {
      const { data, error } = await client.from('user_roles').select('role').eq('user_id', userId)
      fail(error)
      return normalizeRoles((data ?? []).map((r) => r.role))
    },
    async myProfile(userId) {
      const { data, error } = await client.from('profiles').select('id,email,display_name,created_at').eq('id', userId).maybeSingle()
      fail(error)
      return data as Profile | null
    },
    async setDisplayName(userId, name) {
      fail((await client.from('profiles').update({ display_name: name }).eq('id', userId)).error)
    },
    async listUsers() {
      const [{ data: profiles, error: e1 }, { data: roles, error: e2 }] = await Promise.all([
        client.from('profiles').select('id,email,display_name,created_at').order('created_at'),
        client.from('user_roles').select('user_id,role'),
      ])
      fail(e1); fail(e2)
      return (profiles ?? []).map((p) => ({ ...(p as Profile), roles: normalizeRoles((roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role)) }))
    },
    async audit(limit = 50) {
      const { data, error } = await client.from('role_audit').select('id,actor,target,role,action,at').order('at', { ascending: false }).limit(limit)
      fail(error)
      return (data ?? []) as AuditEntry[]
    },
    async grant(userId, role) { fail((await client.rpc('grant_role', { target: userId, _role: role })).error) },
    async revoke(userId, role) { fail((await client.rpc('revoke_role', { target: userId, _role: role })).error) },
  }
}

