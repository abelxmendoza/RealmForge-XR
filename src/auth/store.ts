import { create } from 'zustand'
import type { AuthBackend, AuthUser, Profile } from './backend.ts'
import { can, type Capability, type Role } from './roles.ts'

export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in'

export interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  profile: Profile | null
  roles: Role[]
  error: string | null
  linkSentTo: string | null
  backend: AuthBackend | null
  init(backend: AuthBackend | null): Promise<void>
  sendMagicLink(email: string, redirectTo: string): Promise<void>
  verifyCode(code: string): Promise<void>
  signOut(): Promise<void>
  reload(): Promise<void>
  can(cap: Capability): boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Factory so tests get an isolated store; the app uses `useAuth` below. */
export function createAuthStore() {
  let backend: AuthBackend | null = null
  let unsubscribe: (() => void) | null = null
  return create<AuthState>((set, get) => {
    const load = async (user: AuthUser | null) => {
      if (!backend) return
      if (!user) return set({ status: 'signed-out', user: null, profile: null, roles: [] })
      try {
        const [roles, profile] = await Promise.all([backend.myRoles(user.id), backend.myProfile(user.id)])
        set({ status: 'signed-in', user, roles, profile, error: null, linkSentTo: null })
      } catch (e) {
        // Signed in but roles unreadable: treat as no privileges rather than guessing.
        set({ status: 'signed-in', user, roles: [], profile: null, error: `Could not load your roles: ${(e as Error).message}` })
      }
    }
    return {
      status: 'loading', user: null, profile: null, roles: [], error: null, linkSentTo: null, backend: null,
      async init(b) {
        unsubscribe?.()
        backend = b
        set({ backend: b })
        if (!b) return set({ status: 'disabled', user: null, roles: [], profile: null })
        unsubscribe = b.onChange((u) => { void load(u) })
        await load(await b.currentUser())
      },
      async sendMagicLink(email, redirectTo) {
        if (!backend) throw new Error('Sign-in is not configured on this deployment.')
        const clean = email.trim().toLowerCase()
        if (!EMAIL_RE.test(clean)) return set({ error: 'Enter a valid email address.' })
        set({ error: null })
        try {
          await backend.sendMagicLink(clean, redirectTo)
          set({ linkSentTo: clean })
        } catch (e) { set({ error: (e as Error).message }) }
      },
      async verifyCode(code) {
        const email = get().linkSentTo
        if (!backend || !email) return
        if (!/^\d{6,10}$/.test(code.trim())) return set({ error: 'Enter the code from the email.' })
        try { await backend.verifyCode(email, code.trim()) } catch (e) { set({ error: (e as Error).message }) }
      },
      async signOut() {
        if (!backend) return
        await backend.signOut()
        set({ status: 'signed-out', user: null, profile: null, roles: [], linkSentTo: null })
      },
      async reload() { if (backend) await load(await backend.currentUser()) },
      can(cap) { return can(get().roles, cap) },
    }
  })
}

export const useAuth = createAuthStore()
