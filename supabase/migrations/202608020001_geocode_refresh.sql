alter table caring.members
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_attempted_at timestamptz,
  add column if not exists geocode_status text;

create index if not exists members_geocode_refresh_idx
  on caring.members (geocoded_at, geocode_attempted_at)
  where address is not null;

create or replace function public.caring_geocode_candidates(batch_size integer default 25)
returns table (id uuid, address text)
language sql
security definer
set search_path = pg_catalog, caring
as $$
  select m.id, m.address
  from caring.members as m
  where nullif(btrim(m.address), '') is not null
    and (m.geocoded_at is null or m.geocoded_at < now() - interval '18 days')
    and (
      m.geocode_attempted_at is null
      or m.geocode_attempted_at < now() - interval '12 hours'
    )
  order by
    m.geocoded_at nulls first,
    m.geocode_attempted_at nulls first,
    m.geocoded_at
  limit least(greatest(batch_size, 1), 25);
$$;

create or replace function public.caring_record_geocode(
  member_id uuid,
  member_latitude double precision,
  member_longitude double precision
)
returns void
language sql
security definer
set search_path = pg_catalog, caring
as $$
  update caring.members
  set latitude = member_latitude,
      longitude = member_longitude,
      geocoded_at = now(),
      geocode_attempted_at = now(),
      geocode_status = 'ok'
  where id = member_id;
$$;

create or replace function public.caring_record_geocode_failure(
  member_id uuid,
  failure_status text
)
returns void
language sql
security definer
set search_path = pg_catalog, caring
as $$
  update caring.members
  set geocode_attempted_at = now(),
      geocode_status = left(coalesce(failure_status, 'unknown_error'), 120)
  where id = member_id;
$$;

create or replace function public.caring_expire_stale_geocodes()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, caring
as $$
declare
  expired_count bigint;
begin
  update caring.members
  set latitude = null,
      longitude = null,
      geocode_status = 'expired'
  where geocoded_at < now() - interval '29 days'
    and (latitude is not null or longitude is not null);

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.caring_geocode_candidates(integer) from public, anon, authenticated;
revoke all on function public.caring_record_geocode(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.caring_record_geocode_failure(uuid, text) from public, anon, authenticated;
revoke all on function public.caring_expire_stale_geocodes() from public, anon, authenticated;

grant execute on function public.caring_geocode_candidates(integer) to service_role;
grant execute on function public.caring_record_geocode(uuid, double precision, double precision) to service_role;
grant execute on function public.caring_record_geocode_failure(uuid, text) to service_role;
grant execute on function public.caring_expire_stale_geocodes() to service_role;

