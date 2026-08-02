# Caring

Current application version: **0.2.1**

A privacy-conscious web app for finding members nearest to a selected member.

## Project status

Initial repository setup. The member dataset is intentionally excluded from Git because it contains names, contact details, and addresses.

## Planned workflow

1. Select a member with a known address.
2. Calculate distances to other members.
3. Show nearby members ordered by distance.

> Distance results should be ordered nearest to farthest (ascending distance). If “descending” is intentional, this can be reversed in the interface.

## Secure Supabase setup

Member records contain personally identifiable information. The included migration:

- enables and forces Row Level Security;
- denies access to anonymous and authenticated browser roles by default;
- reserves elevated access for trusted server-side code;
- adds nullable coordinates for distance calculations later.

Apply `supabase/migrations/202608010001_create_members.sql` in the Supabase SQL Editor. Then install dependencies and run the importer from a trusted local terminal with `SUPABASE_DB_URL` set in the environment:

```powershell
npm install
npm run import:members
```

Before importing, copy `.env.example` to `.env` and put the Session pooler connection string in `.env`. The real `.env` is ignored by Git.

Never place the database connection string or a Supabase secret/service-role key in HTML or browser JavaScript.

The member table lives in the dedicated `caring` schema rather than `public`, allowing this app to share an existing Supabase project while remaining isolated from its other applications. Do not add `caring` to the Data API's exposed schemas; access should go through narrowly scoped server-side functions added for the app.

## Google driving routes

The `route-matrix` Supabase Edge Function proxies Google Routes Compute Route Matrix. It accepts coordinates only and keeps `GOOGLE_MAPS_API_KEY` server-side. Deploy it with JWT verification enabled and configure these function secrets:

```powershell
npx supabase secrets set GOOGLE_MAPS_API_KEY=your-key ALLOWED_ORIGIN=https://your-site.example
npx supabase functions deploy route-matrix
```

The public Supabase project URL, publishable key, function URL, and Auth redirect URL live in `config.example.js`. These values are safe for browser use; never add a secret/service-role key or `GOOGLE_MAPS_API_KEY` there. The site uses invite-only email magic links and forwards the signed-in user's short-lived access token to the function. Until authentication and the function are available, route calculations fall back to direct distance.

In Supabase Auth settings, set the Site URL and an exact redirect URL to `https://esemmelman.github.io/caring1/`. Keep public sign-ups disabled and invite permitted users from Authentication > Users.

The `member-directory` Edge Function validates the caller's Supabase JWT and confirms that the authenticated email exists in `caring.members`. It returns names, addresses, coordinates, email addresses, and phone numbers for visible locatable members so authorized users can view contact details. The endpoint is unavailable to anonymous users and non-member project accounts.

The `caring.members.dont_show` flag excludes addressless records and all but one member at a duplicate normalized address. For existing duplicates, the alphabetically first `name_first_last` record remains visible.

The private `refresh-geocodes` function refreshes up to 25 of the oldest address coordinates each day. Supabase Cron invokes it at 10:00 UTC using a random credential generated and stored in Vault. Coordinates are refreshed on an 18-day target cycle and automatically cleared after 29 days if refreshes fail, complying with Google Maps Platform's 30-day geocode caching limit.
