# Caring

Current application version: **0.3.0**

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

The `route-matrix` Supabase Edge Function proxies Google Routes Compute Route Matrix. It accepts coordinates only and keeps `GOOGLE_MAPS_API_KEY` server-side. The function validates the shared passcode before calling Google. Configure these function secrets:

```powershell
npx supabase secrets set GOOGLE_MAPS_API_KEY=your-key ALLOWED_ORIGIN=https://your-site.example
npx supabase functions deploy route-matrix
```

## Passcode access

The site accepts a shared, case-sensitive passcode. Its value is stored only in the Supabase `CARING_PASSCODE` Edge Function secret. Never add it to HTML, JavaScript, or a committed configuration file. After a successful login, the browser saves a signed session token for 90 days in local storage. The passcode is never saved in browser storage. The server enforces the original expiration without extending it on return visits. Sign-out clears the saved session on this browser; clearing browser data also requires a new login.

The `member-directory` and `route-matrix` functions validate the passcode or signed session on every request. Their platform JWT checks are disabled because these credentials are not Supabase user JWTs. The service-role-only `caring_passcode_directory()` database function returns visible, locatable members; browser database roles cannot execute it. Passcode access allows viewing the directory and calculating routes. The existing `member-admin` endpoint still requires an administrator's Supabase JWT; the passcode does not grant member-editing permissions.

To release this change together:

1. Apply `supabase/migrations/20260909053614_passcode_access.sql`.
2. Set `CARING_PASSCODE` using Supabase secret storage (already configured for the current project). To rotate it, put the replacement in an ignored `.env.passcode` file and run `npx supabase secrets set --env-file .env.passcode`.
3. Configure `CARING_SESSION_SECRET` with a random secret of at least 32 bytes (already configured for this project). Rotating it invalidates existing remembered sessions. Deploy `member-directory` and `route-matrix` with the checked-in `supabase/config.toml` settings: `npx supabase functions deploy member-directory route-matrix --use-api`.
4. Publish the updated static site, including `auth.js`, `app.js`, and `index.html`.

The backend and frontend authentication changes must be released together; the previous email-link frontend cannot access the new passcode endpoints.

The `caring.members.dont_show` flag excludes addressless records and all but one member at a duplicate normalized address. For existing duplicates, the alphabetically first `name_first_last` record remains visible.

The private `refresh-geocodes` function refreshes up to 25 of the oldest address coordinates each day. Supabase Cron invokes it at 10:00 UTC using a random credential generated and stored in Vault. Coordinates are refreshed on an 18-day target cycle and automatically cleared after 29 days if refreshes fail, complying with Google Maps Platform's 30-day geocode caching limit.
