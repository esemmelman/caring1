import { createClient } from 'npm:@supabase/supabase-js@2';

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const MAX_BATCH_SIZE = 25;

function availableSecretKeys() {
  const keys = new Set<string>();
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacyKey) keys.add(legacyKey);
  const runToken = Deno.env.get('GEOCODE_RUN_TOKEN');
  if (runToken) keys.add(runToken);

  try {
    const currentKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    for (const value of Object.values(currentKeys)) {
      if (typeof value === 'string') keys.add(value);
    }
  } catch {
    console.error('Unable to parse SUPABASE_SECRET_KEYS.');
  }

  return keys;
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  let currentKey = '';
  try {
    const currentKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    currentKey = Object.values(currentKeys).find((value) => typeof value === 'string') as string ?? '';
  } catch {
    // The caller receives a configuration error below if no admin key is available.
  }
  const key = currentKey || legacyKey;
  if (!url || !key) throw new Error('Supabase service credentials are unavailable.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  }

  const supabase = adminClient();
  const suppliedKey = request.headers.get('apikey') ?? '';
  let authorized = Boolean(suppliedKey && availableSecretKeys().has(suppliedKey));

  if (!authorized) {
    const cronToken = request.headers.get('x-cron-token') ?? '';
    if (cronToken) {
      const { data, error } = await supabase.rpc('caring_verify_geocode_cron_token', {
        candidate: cronToken,
      });
      authorized = !error && data === true;
    }
  }

  if (!authorized) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!googleApiKey) {
    return Response.json({ error: 'Google geocoding is not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requestedSize = Number(body.batchSize ?? MAX_BATCH_SIZE);
    const batchSize = Math.min(Math.max(Math.trunc(requestedSize) || MAX_BATCH_SIZE, 1), MAX_BATCH_SIZE);

    const { data: expired, error: expiryError } = await supabase.rpc('caring_expire_stale_geocodes');
    if (expiryError) throw expiryError;

    const { data: candidates, error: candidateError } = await supabase.rpc(
      'caring_geocode_candidates',
      { batch_size: batchSize },
    );
    if (candidateError) throw candidateError;

    let updated = 0;
    const failures: Array<{ id: string; status: string }> = [];

    for (const member of candidates ?? []) {
      const query = new URLSearchParams({
        address: member.address,
        key: googleApiKey,
        region: 'us',
      });
      const response = await fetch(`${GOOGLE_GEOCODING_URL}?${query}`);
      const result = await response.json();
      const location = result.results?.[0]?.geometry?.location;

      if (response.ok && result.status === 'OK'
        && Number.isFinite(location?.lat) && Number.isFinite(location?.lng)) {
        const { error } = await supabase.rpc('caring_record_geocode', {
          member_id: member.id,
          member_latitude: location.lat,
          member_longitude: location.lng,
        });
        if (error) throw error;
        updated += 1;
      } else {
        const status = String(result.status ?? `http_${response.status}`).toLowerCase();
        const { error } = await supabase.rpc('caring_record_geocode_failure', {
          member_id: member.id,
          failure_status: status,
        });
        if (error) throw error;
        failures.push({ id: member.id, status });

        if (status === 'over_query_limit' || status === 'request_denied') break;
      }
    }

    return Response.json({
      attempted: (candidates ?? []).length,
      updated,
      failed: failures.length,
      expired: Number(expired ?? 0),
      failures,
    });
  } catch (error) {
    console.error('Geocode refresh failed', error);
    return Response.json({ error: 'Unable to refresh geocodes.' }, { status: 500 });
  }
});
