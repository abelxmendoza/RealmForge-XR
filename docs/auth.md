# Accounts, roles and sign-in

RealmForge XR has optional accounts. Guests can still use everything public (landing, world editor,
offline demos); signing in adds roles. Backend: Supabase project **`realmforge-xr`**
(`dtuozjfuiykxwsymjhcm`, us-west-1, free tier, created 2026-10-21).

## Roles

| Role | Who | Can |
| --- | --- | --- |
| **Admin** | exactly one account: Abel (`abelxmendoza@gmail.com`) | everything, and is the only one who can grant or revoke Founder / Developer |
| **Founder** | granted by the admin (Abel, Emiliano) | see every user, their roles and the role-change log |
| **Developer** | granted by the admin (Abel, Emiliano) | developer tools: Creative Studio (`?studio=1`) |
| **Member** | everyone who signs in | the app as usual |

Abel's account gets **Admin + Founder + Developer** automatically the first time that email signs in and is
confirmed. Emiliano signs in once (he becomes a Member), then Abel opens **`?admin=1`** and ticks
Founder and Developer for him.

How it is enforced (`supabase/migrations/20261021170000_users_and_roles.sql`):

* The database is the authority. Tables have row-level security; members only read their own profile
  and roles, founders and the admin read everything, and nobody can write roles directly.
* Roles change only through `grant_role` / `revoke_role`, which check for the admin inside the database,
  refuse `admin` and `member`, and write `role_audit`.
* A unique index allows **one** admin. The admin email lives in `private.app_config` (not exposed by
  the API) and only takes effect once that address is **confirmed**, so typing it into the sign-in box
  without access to the inbox gets nothing.
* `src/auth/roles.ts` mirrors the rules for the UI only. Hiding a button grants or removes nothing.

## Sign-in

Email magic link (no passwords). The link returns to the page you were on. On a headset, the email can
be opened on a phone and the **code** typed into the headset instead (needs the template step below).

## Applying the Auth settings from the terminal

Steps 1 and 3 below are kept in the repo (`supabase/auth-config.json`, `supabase/templates/magic_link.html`)
and pushed with the Management API:

```
npx supabase@2.120.0 login                     # once; opens your browser, saves ~/.supabase/access-token
node tools/auth/push-auth-config.mjs           # dry run: shows the diff
node tools/auth/push-auth-config.mjs --apply   # applies and re-reads to verify
node tools/auth/push-auth-config.mjs --apply --include-email   # also the email subject/template: only after custom SMTP (free tier refuses it otherwise)
```

Applied 2026-10-21: site URL and redirect allow-list. The email template is NOT applied yet (free tier + default mailer).

Vercel env vars (step 4) were added on 2026-10-21 for production, preview and development; they apply on
the next deploy.

## Setup steps (manual equivalents)

1. **URL configuration**: Authentication → URL Configuration
   * Site URL: `https://realmforge-xr.vercel.app`
   * Redirect URLs: `https://realmforge-xr.vercel.app/**`, `https://localhost:5173/**`, and your LAN
     dev URL for the Quest (for example `https://192.168.1.224:5173/**`)

   Without this, links fall back to the default Site URL (`http://localhost:3000`).
2. **Email delivery**: Supabase's built-in mailer **only sends to members of your Supabase team** and
   allows only a few emails per hour.
   * For Emiliano now: invite his email to the org (Organization → Team), **or**
   * for real users: Authentication → Emails → SMTP Settings with a provider (for example Resend), then
     raise the rate limit.
3. **Optional, headset code**: Authentication → Emails → Magic Link template: add
   `Or enter this code: {{ .Token }}` so the in-app "Enter the code" option works across devices.
4. **Vercel** (only when you choose to deploy): add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (values in `.env.example`) to the project's environment variables.
   Without them the deployed app runs in guest mode, as it does today.

## Local development

`.env.local` (gitignored) holds the two public values from `.env.example`. With them, `npm run dev`
shows **Sign in** in the landing header. Without them, the app runs in guest mode, and role-gated pages
(Studio, `?admin=1`) open with no account check because there is nothing to check against. The Studio API
stays loopback-only either way.

## Code map

```
supabase/migrations/…users_and_roles.sql   schema, RLS, triggers, grant/revoke functions
src/auth/roles.ts                          roles → capabilities (UI mirror of the SQL rules)
src/auth/backend.ts                        AuthBackend interface, config, lazy loader (guest mode if unset)
src/auth/supabase.ts                       Supabase implementation (loaded only when configured)
src/auth/store.ts                          zustand store: session, profile, roles, magic link / code
src/auth/ui/AuthUI.tsx                     AccountMenu (landing + studio header), SignInForm, RequireCapability
src/auth/ui/AdminApp.tsx                   ?admin=1: users, Founder/Developer switches, role-change log
```

## Verified (2026-10-21)

* Against the live database, inside a transaction that rolled back: an unconfirmed admin email gets no
  privileges and gets Admin + Founder + Developer once confirmed; a member can't grant roles, insert roles
  directly or change their email, but can set a display name; the admin grants Founder + Developer
  (duplicates are not re-audited) and can't grant or revoke Admin; a founder sees every user and the log
  but can't grant; a second admin is rejected by the unique index.
* Anonymous API calls (with the public key): every table refused, `grant_role` refused, `private` schema
  not exposed.
* Unit tests: `src/auth/roles.test.ts`, `src/auth/store.test.ts` (including refusing secret keys in the
  browser bundle).
* Browser: Sign in in the landing header; `?admin=1` and `?studio=1` show the sign-in card when signed out.

**Not verified yet:** a real magic-link sign-in (needs steps 1–2, and your inbox), the admin page with
live data, Emiliano's account, and the deployed site.
