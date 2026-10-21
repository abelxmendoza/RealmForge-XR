-- RealmForge XR: users, roles and privileges (docs/auth.md).
--
-- Roles (a user can hold several):
--   admin      exactly ONE account (enforced by a unique index); bootstrapped from private.app_config
--              when that email is CONFIRMED. Cannot be granted or revoked through the API.
--   founder    granted by the admin; can see all users, roles and the audit log.
--   developer  granted by the admin; developer tools (Creative Studio, debug views).
--   member     everyone who signs in.
-- Only the admin can grant/revoke founder and developer, through public.grant_role / revoke_role.
-- Tables have RLS and no write policies: every role change goes through those audited functions.

create type public.app_role as enum ('admin', 'founder', 'developer', 'member');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
-- At most one admin, ever, at the database level.
create unique index user_roles_single_admin on public.user_roles ((true)) where role = 'admin';

create table public.role_audit (
  id bigint generated always as identity primary key,
  actor uuid,
  target uuid not null,
  role public.app_role not null,
  action text not null check (action in ('grant', 'revoke', 'bootstrap')),
  at timestamptz not null default now()
);

-- Private schema: not exposed by the Data API.
create schema if not exists private;
create table private.app_config (key text primary key, value text not null);
insert into private.app_config (key, value) values ('admin_email', 'abelxmendoza@gmail.com');
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on private.app_config from public, anon, authenticated;

create function private.has_role(_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = _role)
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('admin', 'founder'))
$$;
revoke all on function private.has_role(public.app_role), private.is_staff() from public, anon;
grant execute on function private.has_role(public.app_role), private.is_staff() to authenticated;

-- Profile + member role for every user; admin (+ founder, developer) for the configured, confirmed email.
create function private.handle_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  insert into public.user_roles (user_id, role) values (new.id, 'member') on conflict do nothing;
  if new.email_confirmed_at is not null
     and lower(new.email) = (select lower(value) from private.app_config where key = 'admin_email')
     and not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin'), (new.id, 'founder'), (new.id, 'developer')
    on conflict do nothing;
    insert into public.role_audit (actor, target, role, action) values (null, new.id, 'admin', 'bootstrap');
  end if;
  return new;
end
$$;
revoke all on function private.handle_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_auth_user();
create trigger on_auth_user_confirmed after update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_auth_user();

-- Admin-only, audited role management (exposed as RPC).
create function public.grant_role(target uuid, _role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role('admin') then
    raise exception 'only the admin can grant roles' using errcode = '42501';
  end if;
  if _role not in ('founder', 'developer') then
    raise exception 'role % cannot be granted', _role using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'no such user' using errcode = '22023';
  end if;
  insert into public.user_roles (user_id, role, granted_by) values (target, _role, (select auth.uid()))
  on conflict do nothing;
  if found then
    insert into public.role_audit (actor, target, role, action) values ((select auth.uid()), target, _role, 'grant');
  end if;
end
$$;

create function public.revoke_role(target uuid, _role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role('admin') then
    raise exception 'only the admin can revoke roles' using errcode = '42501';
  end if;
  if _role not in ('founder', 'developer') then
    raise exception 'role % cannot be revoked', _role using errcode = '22023';
  end if;
  delete from public.user_roles where user_id = target and role = _role;
  if found then
    insert into public.role_audit (actor, target, role, action) values ((select auth.uid()), target, _role, 'revoke');
  end if;
end
$$;
revoke all on function public.grant_role(uuid, public.app_role), public.revoke_role(uuid, public.app_role) from public, anon;
grant execute on function public.grant_role(uuid, public.app_role), public.revoke_role(uuid, public.app_role) to authenticated;

-- Row level security.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_audit enable row level security;

revoke all on public.profiles, public.user_roles, public.role_audit from anon;
revoke insert, update, delete on public.profiles, public.user_roles, public.role_audit from authenticated;
grant select on public.profiles, public.user_roles, public.role_audit to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "read own profile, staff read all" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));
create policy "edit own display name" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "read own roles, staff read all" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy "staff read audit" on public.role_audit for select to authenticated
  using ((select private.is_staff()));

create index role_audit_target_idx on public.role_audit (target);
create index user_roles_granted_by_idx on public.user_roles (granted_by);
