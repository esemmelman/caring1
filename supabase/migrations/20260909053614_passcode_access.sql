-- Called only by the passcode-protected Edge Function; never by browser roles.
create function public.caring_passcode_directory()
returns table (
  id uuid,
  name text,
  address text,
  latitude double precision,
  longitude double precision,
  email text,
  phone text
)
language plpgsql
security definer
set search_path = pg_catalog, caring
as $$
begin
  return query
  select
    member.id,
    member.name_first_last,
    member.address,
    member.latitude,
    member.longitude,
    member.email,
    member.phone
  from caring.members as member
  where member.dont_show = false
    and nullif(btrim(member.address), '') is not null
    and member.latitude is not null
    and member.longitude is not null
  order by member.name_first_last;
end;
$$;

revoke all on function public.caring_passcode_directory()
  from public, anon, authenticated;
grant execute on function public.caring_passcode_directory()
  to service_role;

