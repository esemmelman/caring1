create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'caring_geocode_cron_token'
  ) then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'caring_geocode_cron_token',
      'Authenticates the private Caring geocode refresh job'
    );
  end if;
end;
$$;

create or replace function public.caring_verify_geocode_cron_token(candidate text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'caring_geocode_cron_token'
      and decrypted_secret = candidate
  );
$$;

revoke all on function public.caring_verify_geocode_cron_token(text)
  from public, anon, authenticated;
grant execute on function public.caring_verify_geocode_cron_token(text)
  to service_role;

do $$
declare
  prior_job_id bigint;
begin
  select jobid into prior_job_id
  from cron.job
  where jobname = 'caring-refresh-geocodes-daily';

  if prior_job_id is not null then
    perform cron.unschedule(prior_job_id);
  end if;

  perform cron.schedule(
    'caring-refresh-geocodes-daily',
    '0 3 * * *',
    $job$
      select net.http_post(
        url := 'https://fgomaujsdblpzxhnnqrg.supabase.co/functions/v1/refresh-geocodes',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'caring_geocode_cron_token'
          )
        ),
        body := '{"batchSize":25}'::jsonb
      );
    $job$
  );
end;
$$;
