create or replace function public.caring_recalculate_visibility()
returns void
language sql
security definer
set search_path = pg_catalog, caring
as $$
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
$$;

create or replace function public.caring_admin_create_member(
  member_name text,
  member_address text,
  member_email text,
  member_phone text,
  member_latitude double precision,
  member_longitude double precision
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, caring, public
as $$
declare
  new_id uuid;
begin
  if nullif(btrim(member_name), '') is null or nullif(btrim(member_address), '') is null then
    raise invalid_parameter_value using message = 'Name and address are required.';
  end if;

  insert into caring.members (
    name_last_first,
    name_first_last,
    email,
    phone,
    address,
    latitude,
    longitude,
    geocoded_at,
    geocode_attempted_at,
    geocode_status
  ) values (
    btrim(member_name),
    btrim(member_name),
    nullif(btrim(member_email), ''),
    nullif(btrim(member_phone), ''),
    btrim(member_address),
    member_latitude,
    member_longitude,
    now(),
    now(),
    'ok'
  )
  returning id into new_id;

  perform public.caring_recalculate_visibility();
  return new_id;
end;
$$;

create or replace function public.caring_admin_update_member(
  member_id uuid,
  member_name text,
  member_address text,
  member_email text,
  member_phone text,
  member_latitude double precision,
  member_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, caring, public
as $$
begin
  if nullif(btrim(member_name), '') is null or nullif(btrim(member_address), '') is null then
    raise invalid_parameter_value using message = 'Name and address are required.';
  end if;

  update caring.members
  set name_last_first = btrim(member_name),
      name_first_last = btrim(member_name),
      email = nullif(btrim(member_email), ''),
      phone = nullif(btrim(member_phone), ''),
      address = btrim(member_address),
      latitude = member_latitude,
      longitude = member_longitude,
      geocoded_at = now(),
      geocode_attempted_at = now(),
      geocode_status = 'ok'
  where id = member_id;

  if not found then
    raise no_data_found using message = 'Member not found.';
  end if;

  perform public.caring_recalculate_visibility();
end;
$$;

create or replace function public.caring_admin_delete_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, caring, public
as $$
begin
  delete from caring.members where id = member_id;
  if not found then
    raise no_data_found using message = 'Member not found.';
  end if;
  perform public.caring_recalculate_visibility();
end;
$$;

revoke all on function public.caring_recalculate_visibility() from public, anon, authenticated;
revoke all on function public.caring_admin_create_member(text, text, text, text, double precision, double precision) from public, anon, authenticated;
revoke all on function public.caring_admin_update_member(uuid, text, text, text, text, double precision, double precision) from public, anon, authenticated;
revoke all on function public.caring_admin_delete_member(uuid) from public, anon, authenticated;

grant execute on function public.caring_recalculate_visibility() to service_role;
grant execute on function public.caring_admin_create_member(text, text, text, text, double precision, double precision) to service_role;
grant execute on function public.caring_admin_update_member(uuid, text, text, text, text, double precision, double precision) to service_role;
grant execute on function public.caring_admin_delete_member(uuid) to service_role;

