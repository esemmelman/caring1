alter table caring.members
  add column if not exists dont_show boolean not null default false;

with ranked_addresses as (
  select
    id,
    nullif(lower(regexp_replace(btrim(address), '\s+', ' ', 'g')), '') as normalized_address,
    row_number() over (
      partition by nullif(lower(regexp_replace(btrim(address), '\s+', ' ', 'g')), '')
      order by name_first_last, id
    ) as address_rank
  from caring.members
)
update caring.members as member
set dont_show = (
  ranked.normalized_address is null
  or ranked.address_rank > 1
)
from ranked_addresses as ranked
where ranked.id = member.id;

create or replace function public.caring_directory_members(requester_email text)
returns table (
  id uuid,
  name text,
  address text,
  latitude double precision,
  longitude double precision
)
language plpgsql
security definer
set search_path = pg_catalog, caring
as $$
begin
  if requester_email is null or not exists (
    select 1
    from caring.members as authorized_member
    where lower(btrim(authorized_member.email)) = lower(btrim(requester_email))
  ) then
    raise insufficient_privilege using message = 'Directory membership is required.';
  end if;

  return query
  select
    member.id,
    member.name_first_last,
    member.address,
    member.latitude,
    member.longitude
  from caring.members as member
  where member.dont_show = false
    and nullif(btrim(member.address), '') is not null
    and member.latitude is not null
    and member.longitude is not null
  order by member.name_first_last;
end;
$$;

create or replace function public.caring_geocode_candidates(batch_size integer default 25)
returns table (id uuid, address text)
language sql
security definer
set search_path = pg_catalog, caring
as $$
  select m.id, m.address
  from caring.members as m
  where m.dont_show = false
    and nullif(btrim(m.address), '') is not null
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

revoke all on function public.caring_directory_members(text)
  from public, anon, authenticated;
revoke all on function public.caring_geocode_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.caring_directory_members(text)
  to service_role;
grant execute on function public.caring_geocode_candidates(integer)
  to service_role;

