import { createClient } from 'npm:@supabase/supabase-js@2';

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

function corsHeaders(request: Request) {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '';
  const requestOrigin = request.headers.get('origin') ?? '';
  const origin = allowedOrigin && requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'private, no-store',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const publishableKey = configuredKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  const secretKey = configuredKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization') ?? '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');

  if (!supabaseUrl || !publishableKey || !secretKey || !accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401, headers });
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401, headers });
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await adminClient.rpc('caring_directory_members', {
    requester_email: user.email,
  });

  if (error) {
    const forbidden = error.code === '42501';
    console.error('Directory request failed', error.code, error.message);
    return new Response(
      JSON.stringify({ error: forbidden ? 'Directory membership is required.' : 'Unable to load directory.' }),
      { status: forbidden ? 403 : 500, headers },
    );
  }

  return new Response(JSON.stringify({ members: data ?? [] }), { status: 200, headers });
});

