import { createClient } from 'npm:@supabase/supabase-js@2';

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function configuredKey(jsonName: string, legacyName: string) {
  try {
    const keys = JSON.parse(Deno.env.get(jsonName) ?? '{}');
    const current = Object.values(keys).find((value) => typeof value === 'string');
    if (typeof current === 'string') return current;
  } catch {
    console.error(`Unable to parse ${jsonName}.`);
  }
  return Deno.env.get(legacyName) ?? '';
}

function adminEmails() {
  return new Set(
    (Deno.env.get('DIRECTORY_ADMIN_EMAILS') ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function corsHeaders(request: Request) {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '';
  const requestOrigin = request.headers.get('origin') ?? '';
  const origin = allowedOrigin && requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

async function geocode(address: string, apiKey: string) {
  const query = new URLSearchParams({ address, key: apiKey, region: 'us' });
  const response = await fetch(`${GOOGLE_GEOCODING_URL}?${query}`);
  const body = await response.json();
  const location = body.results?.[0]?.geometry?.location;
  if (!response.ok || body.status !== 'OK'
    || !Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) {
    throw new Error(`Address could not be geocoded (${body.status ?? response.status}).`);
  }
  return { latitude: location.lat, longitude: location.lng };
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const publishableKey = configuredKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  const secretKey = configuredKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
  const accessToken = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');

  if (!supabaseUrl || !publishableKey || !secretKey || !googleApiKey || !accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401, headers });
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !user?.email || !adminEmails().has(user.email.toLowerCase())) {
    return new Response(JSON.stringify({ error: 'Administrator access is required.' }), { status: 403, headers });
  }

  try {
    const input = await request.json();
    const action = String(input.action ?? '');
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (action === 'delete') {
      const { error } = await adminClient.rpc('caring_admin_delete_member', {
        member_id: input.id,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    if (action !== 'create' && action !== 'update') {
      return new Response(JSON.stringify({ error: 'Invalid action.' }), { status: 400, headers });
    }

    const name = String(input.name ?? '').trim();
    const address = String(input.address ?? '').trim();
    const email = String(input.email ?? '').trim();
    const phone = String(input.phone ?? '').trim();
    if (!name || !address) {
      return new Response(JSON.stringify({ error: 'Name and address are required.' }), { status: 400, headers });
    }

    const coordinates = await geocode(address, googleApiKey);
    const parameters = {
      member_name: name,
      member_address: address,
      member_email: email,
      member_phone: phone,
      member_latitude: coordinates.latitude,
      member_longitude: coordinates.longitude,
    };

    if (action === 'create') {
      const { data, error } = await adminClient.rpc('caring_admin_create_member', parameters);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, id: data }), { status: 200, headers });
    }

    const { error } = await adminClient.rpc('caring_admin_update_member', {
      member_id: input.id,
      ...parameters,
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, id: input.id }), { status: 200, headers });
  } catch (error) {
    console.error('Member administration failed', error);
    const message = error instanceof Error ? error.message : 'Unable to update member.';
    return new Response(JSON.stringify({ error: message }), { status: 422, headers });
  }
});

