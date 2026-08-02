do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'caring-refresh-geocodes-daily';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'caring-refresh-geocodes-daily',
    '0 10 * * *',
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

