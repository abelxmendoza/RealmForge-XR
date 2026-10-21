import { describe, expect, it } from 'vitest'
import { can, canChangeRole, normalizeRoles, roleTitle, type Role } from './roles'

const abel: Role[] = ['admin', 'founder', 'developer', 'member']
const emiliano: Role[] = ['founder', 'developer', 'member']
const member: Role[] = ['member']

describe('roles and capabilities', () => {
  it('gives the admin everything, including role management', () => {
    for (const c of ['use-editor', 'view-users', 'view-audit', 'manage-roles', 'creative-studio', 'dev-tools'] as const) expect(can(abel, c)).toBe(true)
  })

  it('gives a founder + developer everything except role management', () => {
    expect(can(emiliano, 'view-users')).toBe(true)
    expect(can(emiliano, 'creative-studio')).toBe(true)
    expect(can(emiliano, 'dev-tools')).toBe(true)
    expect(can(emiliano, 'manage-roles')).toBe(false)
  })

  it('keeps members to the editor', () => {
    expect(can(member, 'use-editor')).toBe(true)
    expect(can(member, 'view-users')).toBe(false)
    expect(can(member, 'creative-studio')).toBe(false)
    expect(can([], 'use-editor')).toBe(false)
  })

  it('lets only the admin change founder / developer, and nobody change admin or member', () => {
    expect(canChangeRole(abel, 'founder')).toBe(true)
    expect(canChangeRole(abel, 'developer')).toBe(true)
    expect(canChangeRole(abel, 'admin')).toBe(false)
    expect(canChangeRole(abel, 'member')).toBe(false)
    expect(canChangeRole(emiliano, 'developer')).toBe(false)
    expect(canChangeRole(member, 'founder')).toBe(false)
  })

  it('drops unknown role strings from the database', () => {
    expect(normalizeRoles(['member', 'superuser', 'admin', 42])).toEqual(['admin', 'member'])
  })

  it('titles accounts highest role first', () => {
    expect(roleTitle(abel)).toBe('Admin · Founder · Developer')
    expect(roleTitle(emiliano)).toBe('Founder · Developer')
    expect(roleTitle(member)).toBe('Member')
    expect(roleTitle([])).toBe('Guest')
  })
})
