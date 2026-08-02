-- Member contact information is sensitive. This table is inaccessible through
-- the public API until explicit, narrow RLS policies are added.
create extension if not exists pgcrypto;
create schema if not exists caring;

revoke all on schema caring from public, anon, authenticated;
grant usage on schema caring to service_role;

create table if not exists caring.members (
  id uuid primary key default gen_random_uuid(),
  source_uid text,
  name_last_first text not null,
  name_first_last text not null,
  email text,
  phone text,
  address text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint members_longitude_check
    check (longitude is null or longitude between -180 and 180)
);

alter table caring.members enable row level security;
alter table caring.members force row level security;

-- Defense in depth: no browser/API role receives table privileges yet.
revoke all on table caring.members from public, anon, authenticated;
grant all on table caring.members to service_role;

create index if not exists members_name_first_last_idx
  on caring.members (name_first_last);

create index if not exists members_coordinates_idx
  on caring.members (latitude, longitude)
  where latitude is not null and longitude is not null;

create or replace function caring.set_members_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, caring
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists members_set_updated_at on caring.members;
create trigger members_set_updated_at
before update on caring.members
for each row execute function caring.set_members_updated_at();

revoke all on function caring.set_members_updated_at() from public, anon, authenticated;
grant execute on function caring.set_members_updated_at() to service_role;
