/**
 * Roles and capabilities. MIRRORS supabase/migrations/20261021170000_users_and_roles.sql: the database
 * is the authority (RLS + admin-only grant/revoke functions); this module only decides what the UI
 * shows. Hiding a button here never grants or removes access.
 *
 *   admin      exactly one account (the app owner); cannot be granted or revoked in the app
 *   founder    granted by the admin: sees all users, roles and the audit log
 *   developer  granted by the admin: developer tools (Creative Studio, debug views)
 *   member     everyone who signs in
 */
export const ROLES = ['admin', 'founder', 'developer', 'member'] as const
export type Role = (typeof ROLES)[number]

/** Roles the admin can grant and revoke through the app. */
export const GRANTABLE: readonly Role[] = ['founder', 'developer']

export type Capability = 'use-editor' | 'view-users' | 'view-audit' | 'manage-roles' | 'creative-studio' | 'dev-tools'

const CAPABILITIES: Record<Role, readonly Capability[]> = {
  member: ['use-editor'],
  developer: ['use-editor', 'creative-studio', 'dev-tools'],
  founder: ['use-editor', 'view-users', 'view-audit'],
  admin: ['use-editor', 'view-users', 'view-audit', 'manage-roles', 'creative-studio', 'dev-tools'],
}

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', founder: 'Founder', developer: 'Developer', member: 'Member' }

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v)
}

/** Unknown strings from the database are dropped, never treated as a role. */
export function normalizeRoles(raw: unknown[]): Role[] {
  return ROLES.filter((r) => raw.includes(r))
}

export function can(roles: readonly Role[], cap: Capability): boolean {
  return roles.some((r) => CAPABILITIES[r].includes(cap))
}

/** Whether `actor` may grant or revoke `role` (same rule as public.grant_role / revoke_role). */
export function canChangeRole(actor: readonly Role[], role: Role): boolean {
  return actor.includes('admin') && GRANTABLE.includes(role)
}

/** "Admin · Founder · Developer" — highest first, member omitted when other roles exist. */
export function roleTitle(roles: readonly Role[]): string {
  const shown = roles.length > 1 ? roles.filter((r) => r !== 'member') : roles
  return ROLES.filter((r) => shown.includes(r)).map((r) => ROLE_LABEL[r]).join(' · ') || 'Guest'
}
