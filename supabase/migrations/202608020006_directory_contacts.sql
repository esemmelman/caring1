drop function if exists public.caring_directory_members(text);

create function public.caring_directory_members(requester_email text)
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

revoke all on function public.caring_directory_members(text)
  from public, anon, authenticated;
grant execute on function public.caring_directory_members(text)
  to service_role;

