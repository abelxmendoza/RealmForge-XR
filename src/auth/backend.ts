/**
 * Auth backend: a thin interface over Supabase so the store and admin page can be tested with a fake.
 * Configuration comes from VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (public values, safe in
 * the bundle; access is enforced by row-level security). Without them the app runs in guest mode.
 */
import type { Role } from './roles.ts'

export interface AuthUser { id: string; email: string }
export interface Profile { id: string; email: string; display_name: string | null; created_at: string }
export interface UserWithRoles extends Profile { roles: Role[] }
export interface AuditEntry { id: number; actor: string | null; target: string; role: Role; action: 'grant' | 'revoke' | 'bootstrap'; at: string }

export interface AuthBackend {
  currentUser(): Promise<AuthUser | null>
  onChange(cb: (user: AuthUser | null) => void): () => void
  sendMagicLink(email: string, redirectTo: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
  myRoles(userId: string): Promise<Role[]>
  myProfile(userId: string): Promise<Profile | null>
  setDisplayName(userId: string, name: string | null): Promise<void>
  listUsers(): Promise<UserWithRoles[]>
  audit(limit?: number): Promise<AuditEntry[]>
  grant(userId: string, role: Role): Promise<void>
  revoke(userId: string, role: Role): Promise<void>
}

export function readAuthConfig(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>) {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY)?.trim()
  if (!url || !key) return null
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) return null
  if (/^sb_secret_/.test(key) || /service_role/.test(atobSafe(key.split('.')[1] ?? ''))) {
    console.error('[auth] refusing a SECRET Supabase key in the browser bundle; use the publishable key')
    return null
  }
  return { url, key }
}

function atobSafe(s: string) {
  try { return atob(s.replace(/-/g, '+').replace(/_/g, '/')) } catch { return '' }
}

let cached: Promise<AuthBackend | null> | undefined
/** The app's backend, or null in guest mode (no config). supabase-js is loaded only when configured. */
export function loadAuthBackend(): Promise<AuthBackend | null> {
  if (cached) return cached
  const cfg = readAuthConfig()
  cached = cfg ? import('./supabase.ts').then((m) => m.createSupabaseBackend(cfg.url, cfg.key)) : Promise.resolve(null)
  return cached
}
