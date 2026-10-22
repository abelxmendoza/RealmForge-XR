#!/usr/bin/env node
// Push supabase/auth-config.json to the realmforge-xr project's Auth settings via the Supabase
// Management API (docs/auth.md). Dry run by default: prints a diff; `--apply` sends the PATCH.
// `--include-email` also pushes the magic-link subject/template (needs custom SMTP on the free tier).
//
// Token: SUPABASE_ACCESS_TOKEN, the file written by `npx supabase login` (~/.supabase/access-token),
// or the OS keyring entry newer CLIs use.
// The token is never printed.
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REF = 'dtuozjfuiykxwsymjhcm'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const apply = process.argv.includes('--apply')
// Email subject/template changes are refused on the free tier until custom SMTP is configured.
const includeEmail = process.argv.includes('--include-email')

const tokenFile = path.join(os.homedir(), '.supabase', 'access-token')
// Newer CLIs keep the token in the OS keyring (go-keyring: service "Supabase CLI", user = profile).
function keyringToken() {
  const quiet = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  try {
    return execFileSync('secret-tool', ['lookup', 'service', 'Supabase CLI', 'username', 'supabase'], quiet).trim()
  } catch {}
  try { // no secret-tool: Python's secretstorage talks to the same Secret Service
    const py = "import secretstorage as s;c=s.get_default_collection(s.dbus_init());i=next(iter(c.search_items({'service':'Supabase CLI','username':'supabase'})),None);print(i.get_secret().decode() if i else '')"
    return execFileSync('python3', ['-c', py], quiet).trim()
  } catch { return '' }
}
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim() || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '') || keyringToken()
if (!token) {
  console.error('No Supabase access token. Run `npx supabase@2.120.0 login` once (opens your browser), then re-run.')
  process.exit(2)
}

const cfg = JSON.parse(readFileSync(path.join(root, 'supabase', 'auth-config.json'), 'utf8'))
const desired = {
  site_url: cfg.site_url,
  uri_allow_list: cfg.uri_allow_list.join(','),
  ...(includeEmail ? {
    mailer_subjects_magic_link: cfg.mailer_subjects_magic_link,
    mailer_templates_magic_link_content: readFileSync(path.join(root, 'supabase', cfg.mailer_templates_magic_link_content_file), 'utf8'),
  } : {}),
}

const api = (method, body) => fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
})

const res = await api('GET')
if (!res.ok) { console.error(`GET auth config failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); process.exit(1) }
const current = await res.json()
const changes = Object.keys(desired).filter((k) => (current[k] ?? '') !== desired[k])
for (const k of Object.keys(desired)) {
  const show = (v) => (k.includes('templates') ? `${String(v ?? '').length} chars` : JSON.stringify(v ?? null))
  console.log(`${changes.includes(k) ? '~' : '='} ${k}: ${show(current[k])}${changes.includes(k) ? ` -> ${show(desired[k])}` : ''}`)
}
if (!changes.length) { console.log('Already up to date.'); process.exit(0) }
if (!apply) { console.log('\nDry run. Re-run with --apply to change these settings.'); process.exit(0) }
const patch = await api('PATCH', Object.fromEntries(changes.map((k) => [k, desired[k]])))
if (!patch.ok) { console.error(`PATCH failed: HTTP ${patch.status} ${(await patch.text()).slice(0, 300)}`); process.exit(1) }
const after = await (await api('GET')).json()
const bad = changes.filter((k) => after[k] !== desired[k])
console.log(bad.length ? `Applied, but these did not stick: ${bad.join(', ')}` : `Applied ${changes.length} setting(s); verified by re-reading.`)
process.exit(bad.length ? 1 : 0)
