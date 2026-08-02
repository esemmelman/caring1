const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const MAX_DESTINATIONS = 24;

type Coordinate = { lat: number; lon: number };

function corsHeaders(request: Request) {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '';
  const requestOrigin = request.headers.get('origin') ?? '';
  const origin = allowedOrigin && requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

function validCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as Coordinate;
  return Number.isFinite(coordinate.lat)
    && Number.isFinite(coordinate.lon)
    && coordinate.lat >= -90
    && coordinate.lat <= 90
    && coordinate.lon >= -180
    && coordinate.lon <= 180;
}

function waypoint(coordinate: Coordinate) {
  return {
    waypoint: {
      location: {
        latLng: {
          latitude: coordinate.lat,
          longitude: coordinate.lon,
        },
      },
    },
  };
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers });
  }

  const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'Routing is not configured.' }), { status: 503, headers });
  }

  try {
    const body = await request.json();
    const { origin, destinations } = body;

    if (!validCoordinate(origin)
      || !Array.isArray(destinations)
      || destinations.length < 1
      || destinations.length > MAX_DESTINATIONS
      || !destinations.every(validCoordinate)) {
      return new Response(JSON.stringify({ error: 'Invalid origin or destinations.' }), { status: 400, headers });
    }

    const googleResponse = await fetch(GOOGLE_ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration',
      },
      body: JSON.stringify({
        origins: [waypoint(origin)],
        destinations: destinations.map(waypoint),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        units: 'IMPERIAL',
      }),
    });

    if (!googleResponse.ok) {
      console.error('Google Routes error', googleResponse.status, await googleResponse.text());
      return new Response(JSON.stringify({ error: 'The routing provider rejected the request.' }), { status: 502, headers });
    }

    const elements = await googleResponse.json();
    const routes = elements
      .filter((element: Record<string, unknown>) => element.condition === 'ROUTE_EXISTS')
      .map((element: { destinationIndex: number; distanceMeters: number; duration: string }) => ({
        destinationIndex: element.destinationIndex,
        distanceMiles: element.distanceMeters / 1609.344,
        durationMinutes: Math.max(1, Math.round(Number.parseFloat(element.duration) / 60)),
      }));

    return new Response(JSON.stringify({ routes }), { status: 200, headers });
  } catch (error) {
    console.error('Route matrix function error', error);
    return new Response(JSON.stringify({ error: 'Unable to calculate driving routes.' }), { status: 500, headers });
  }
});

