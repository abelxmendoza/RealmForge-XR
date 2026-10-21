import { describe, expect, it, vi } from 'vitest'
import { createAuthStore } from './store'
import { readAuthConfig, type AuthBackend, type AuthUser } from './backend'
import type { Role } from './roles'

function fakeBackend(initial: AuthUser | null, roles: Record<string, Role[]>, opts: { rolesFail?: boolean } = {}) {
  let listener: ((u: AuthUser | null) => void) | null = null
  const b: AuthBackend & { emit(u: AuthUser | null): void } = {
    emit: (u) => listener?.(u),
    currentUser: async () => initial,
    onChange: (cb) => { listener = cb; return () => { listener = null } },
    sendMagicLink: vi.fn(async () => {}),
    verifyCode: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    myRoles: async (id) => { if (opts.rolesFail) throw new Error('permission denied'); return roles[id] ?? [] },
    myProfile: async (id) => ({ id, email: `${id}@x.test`, display_name: null, created_at: '' }),
    setDisplayName: async () => {},
    listUsers: async () => [],
    audit: async () => [],
    grant: async () => {},
    revoke: async () => {},
  }
  return b
}

describe('auth store', () => {
  it('runs in guest mode when sign-in is not configured', async () => {
    const s = createAuthStore()
    await s.getState().init(null)
    expect(s.getState()).toMatchObject({ status: 'disabled', roles: [] })
    expect(s.getState().can('use-editor')).toBe(false)
  })

  it('loads the admin\'s roles and capabilities from the backend', async () => {
    const s = createAuthStore()
    await s.getState().init(fakeBackend({ id: 'abel', email: 'abel@x.test' }, { abel: ['admin', 'founder', 'developer', 'member'] }))
    expect(s.getState().status).toBe('signed-in')
    expect(s.getState().can('manage-roles')).toBe(true)
  })

  it('follows sign-in / sign-out events', async () => {
    const s = createAuthStore()
    const b = fakeBackend(null, { emi: ['founder', 'developer', 'member'] })
    await s.getState().init(b)
    expect(s.getState().status).toBe('signed-out')
    b.emit({ id: 'emi', email: 'emi@x.test' })
    await vi.waitFor(() => expect(s.getState().status).toBe('signed-in'))
    expect(s.getState().can('creative-studio')).toBe(true)
    expect(s.getState().can('manage-roles')).toBe(false)
    await s.getState().signOut()
    expect(s.getState()).toMatchObject({ status: 'signed-out', roles: [] })
  })

  it('grants nothing when roles cannot be read', async () => {
    const s = createAuthStore()
    await s.getState().init(fakeBackend({ id: 'u', email: 'u@x.test' }, {}, { rolesFail: true }))
    expect(s.getState().roles).toEqual([])
    expect(s.getState().error).toMatch(/permission denied/)
  })

  it('validates the email before sending a magic link', async () => {
    const s = createAuthStore()
    const b = fakeBackend(null, {})
    await s.getState().init(b)
    await s.getState().sendMagicLink('not-an-email', 'https://localhost/')
    expect(b.sendMagicLink).not.toHaveBeenCalled()
    await s.getState().sendMagicLink('  Abel@Example.com ', 'https://localhost/')
    expect(b.sendMagicLink).toHaveBeenCalledWith('abel@example.com', 'https://localhost/')
    expect(s.getState().linkSentTo).toBe('abel@example.com')
  })
})

describe('auth config', () => {
  it('needs both a Supabase URL and a publishable key', () => {
    expect(readAuthConfig({})).toBeNull()
    expect(readAuthConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toBeNull()
    expect(readAuthConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' })).toEqual({ url: 'https://abc.supabase.co', key: 'sb_publishable_x' })
    expect(readAuthConfig({ VITE_SUPABASE_URL: 'http://evil.example', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull()
  })

  it('refuses secret / service-role keys in the browser', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(readAuthConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_123' })).toBeNull()
    const payload = btoa(JSON.stringify({ role: 'service_role' }))
    expect(readAuthConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: `h.${payload}.s` })).toBeNull()
    err.mockRestore()
  })
})
