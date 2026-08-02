# Caring

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
