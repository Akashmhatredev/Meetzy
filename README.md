# Meetzy

**Less planning. More meeting.** Bring your friends together, and Meetzy finds the fairest place in between.

Meetzy is a responsive, installable web app for group hangouts. Friends in different parts of a city create a group,
share where they're coming from, vote on what to do, and Meetzy recommends venues using **real Google travel times
for every person**, not the geographic midpoint. The group compares trips side by side, votes, and an organiser
finalises the plan with one-tap Google Maps directions.

- Vue 3 (JavaScript, Composition API) · Vite 8 · Pinia · Vue Router · Tailwind CSS 4 · lucide icons
- Supabase: Postgres + RLS, Auth (email/password, Google OAuth), Realtime, Storage, Edge Functions
- Google Maps Platform: Maps JavaScript API, Places API (New), Routes API (Compute Route Matrix + Compute Routes)
- Deploys to Vercel (front end) + Supabase (database and functions)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design in depth.

---

## What works

| Area | Status |
| --- | --- |
| Landing page, auth (email + Google), password reset, session persistence, protected routes | Implemented |
| Profile, avatar upload (resized to 256px WebP), preferred travel mode, saved places (search / current location / map pin / drag to adjust; edit, delete, default) | Implemented |
| Groups: create, edit, delete, invite links and codes with expiry and use limits, revoke, join, leave, remove members, transfer admin, live updates | Implemented |
| Location sharing per hangout (saved place, one-shot current location, manual pin), group-level opt-in, stop sharing, reminders for friends who haven't shared | Implemented |
| Interactive group map: avatar markers in route colours, meeting area, venue pins, info windows, fit all, map/list toggle, per-friend route polylines | Implemented |
| Activities: 20 categories + custom, multi-select voting, live counts, popular badge, "all picked" vs "most popular" | Implemented |
| Smart midpoint engine (two-pass route-matrix optimisation, Fair / Balanced / Fastest) in a Supabase Edge Function | Implemented |
| Venue discovery (Google Places), filters, comparison table, venue voting with deadline, finalise, confirmation, Google Maps directions, `.ics` export | Implemented |
| In-app notifications (live), light/dark theme, PWA install, mobile bottom navigation | Implemented |

**Honest status:** this repository has never been run against a real Supabase project or real Google APIs (none were
available while it was built). Without credentials the app shows a "configuration required" state; it never fakes
data. What *is* verified is listed under [Testing](#testing).

---

## Quick start (local)

Requires Node 20.19+ (the repo pins 24 in `.nvmrc`).

```bash
nvm use            # or: export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH
npm install
cp .env.example .env   # fill in the values below
npm run dev            # http://localhost:5190
```

Without a `.env`, the landing page works and every signed-in screen explains which variables are missing (`/setup`).

### Environment variables

| Variable | Where | What |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `.env` / Vercel | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env` / Vercel | Supabase anon (public) key. RLS protects the data. |
| `VITE_GOOGLE_MAPS_API_KEY` | `.env` / Vercel | Google **browser** key (referrer-restricted) |
| `VITE_GOOGLE_MAPS_MAP_ID` | `.env` / Vercel | Optional Map ID; defaults to `DEMO_MAP_ID` |
| `GOOGLE_MAPS_SERVER_KEY` | Supabase function secret | Google **server** key for Places + Routes |
| `ALLOWED_ORIGINS` | Supabase function secret | Comma-separated origins allowed to call the functions (e.g. `https://meetzy.vercel.app,http://localhost:5190`) |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions by Supabase. **Never** put a service
role key or the Google server key in a `VITE_` variable: anything prefixed `VITE_` ships to the browser.

---

## Supabase setup

1. **Create a project** at supabase.com. Copy the URL and anon key into `.env`.
2. **Apply the database** (tables, RLS, RPCs, activity catalogue, realtime publication, avatar bucket):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   Migrations live in `supabase/migrations/` and are applied in order.
3. **Authentication → URL configuration:** set *Site URL* to your app URL and add these redirect URLs (and the same
   for `http://localhost:5190` while developing):
   - `https://<app>/home`
   - `https://<app>/reset-password`
   - `https://<app>/join/**`, `https://<app>/hangouts/**` (post-login return paths)
4. **Google sign-in (optional):** Google Cloud → APIs & Services → Credentials → OAuth client (Web). Authorised redirect
   URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Then Supabase → Authentication → Providers → Google:
   paste the client ID and secret.
5. **Email confirmation:** on by default in Supabase. Registration shows "check your inbox" when a session isn't
   returned. Sign-in uses PKCE, so confirmation and reset links must be opened in the same browser.
6. **Edge Functions:**
   ```bash
   npx supabase secrets set GOOGLE_MAPS_SERVER_KEY=... ALLOWED_ORIGINS=https://<app>,http://localhost:5190
   npx supabase functions deploy compute-meetup
   npx supabase functions deploy venue-routes
   ```
   The functions are plain JavaScript; `supabase/config.toml` points each one's `entrypoint` at `index.js` (Supabase
   CLI 2.x). If an older CLI insists on `index.ts`, rename the two `index.js` files; their content is valid TypeScript.
7. **Scheduled cleanup (Google caching terms):** enable the `pg_cron` extension (Database → Extensions), then run once
   in the SQL editor:
   ```sql
   select cron.schedule('meetzy-purge-google-content', '17 3 * * *',
                        $$ select public.purge_expired_google_content() $$);
   ```

### Realtime

The migration adds `groups`, `group_members`, `group_invitations`, `hangouts`, `hangout_locations`,
`hangout_activities`, `activity_votes`, `calculation_runs`, `venues`, `venue_votes` and `notifications` to the
`supabase_realtime` publication. Supabase applies each table's RLS to every subscriber.

---

## Google Cloud setup

Enable these APIs in one Google Cloud project with billing:

| API | Used by | Key |
| --- | --- | --- |
| Maps JavaScript API | maps, markers, polylines | browser |
| Places API (New) | address autocomplete in the browser; venue search, photos and details in the Edge Functions | both |
| Routes API | Compute Route Matrix (engine), Compute Routes (drawn routes) | server |
| Geocoding API (optional) | turning a dropped pin / GPS fix into an address | browser |

Create **two keys**:

- **Browser key** → `VITE_GOOGLE_MAPS_API_KEY`. Application restriction: *Websites* (your domains plus
  `localhost:5190/*`). API restriction: Maps JavaScript API, Places API (New), Geocoding API.
- **Server key** → `GOOGLE_MAPS_SERVER_KEY` secret. API restriction: Places API (New), Routes API. (Edge Functions have
  no fixed IPs, so restrict by API and keep the key secret; set quotas and budget alerts.)

Optional: create a **Map ID** (Map Management, JavaScript, vector) for production styling and set
`VITE_GOOGLE_MAPS_MAP_ID`. Without it, Meetzy uses `DEMO_MAP_ID`, which is fine for development. Dark mode uses the
Maps `colorScheme` option.

### Travel modes

Meetzy maps its modes directly onto Routes API `travelMode` values: `DRIVE`, `TWO_WHEELER`, `TRANSIT`, `WALK`,
`BICYCLE`. Traffic-aware routing is requested only for driving and two-wheeler. Two-wheeler is available only in
some countries (India is one) and cycling is a Google beta; when Google returns no routes the UI says so and suggests
another mode rather than estimating. Transit matrices are limited by Google to 100 elements, so the engine tests fewer
areas and venues for transit.

---

## Deploying to Vercel

1. Import the repository in Vercel (framework: Vite; `vercel.json` sets build output, SPA rewrites and security
   headers).
2. Add the `VITE_` variables in Project Settings → Environment Variables.
3. Add the Vercel URL to Supabase redirect URLs, `ALLOWED_ORIGINS`, and the browser key's referrer list.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :5190 |
| `npm run build` / `npm run preview` | Production build / preview on :5191 |
| `npm test` | Vitest: engine, Google clients, both Edge Function handlers, client utilities |
| `npm run test:db` | Applies every migration to PGlite (Postgres in WASM) and runs the database suite as real roles |
| `npm run icons` | Re-renders the PWA/favicon/social PNGs from `public/favicon.svg` (needs Playwright; see the script header) |

## Testing

- **Database (`npm run test:db`, 92 tests).** Every migration runs on PGlite behind a small Supabase shim (roles,
  `auth.uid()`, storage schema, realtime publication). Tests switch to the `authenticated`, `anon` and `service_role`
  roles and cover RLS on every table, column grants (email hidden), invitations (expiry, revoke, use limits,
  brute-force rate limit), membership flows, location sharing and withdrawal, activity voting, calculation
  start/complete/fail/cache, venue voting and deadlines, finalisation, the 30-day purge, the API quota and account
  deletion.
- **Engine and functions (`npm test`, 94 tests).** Geometry (centroid, geometric median, candidate rings), route-matrix
  parsing, all three strategies on the spec's worked example, incomplete matrices, failed searches and the retry
  area, element budgets for transit, the full pipeline output contract, and both Edge Function handlers (auth, CORS,
  caching, error mapping, rate limits) with a fake `fetch`. The fakes exist only in `tests/`.
- **UI smoke test (run during development, not committed).** Playwright loaded all 27 screens at 390px and 1366px,
  in light and dark, with Supabase requests answered by test fixtures. Every screen rendered with no console errors
  and no horizontal scroll.
- **Not yet verified:** live calls to Google Places/Routes, a real Supabase project (Auth emails, OAuth, Realtime
  delivery, Storage uploads), and the deployed Edge Functions. Do this first once credentials exist: register two
  accounts, create a group, join by link, share two locations, pick an activity, calculate, vote, finalise.

## Security model (summary)

- RLS on every table; default API grants revoked and re-granted per column. Saved places are owner-only; group data is
  member-only; profiles are visible only to group mates and never expose email.
- Multi-step writes go through `SECURITY DEFINER` RPCs with an empty `search_path` that check `auth.uid()` and
  membership. Engine output can be written only by the service role.
- Google server calls happen only in Edge Functions, behind JWT verification, membership checks, CORS allow-lists,
  input hashing (identical requests reuse cached results) and per-user rate limits (`calculate` 8/h, `venue_routes`
  40/h, join attempts 10/10 min).
- No background location tracking: geolocation runs once, on a button press. Stopping sharing, leaving a group or
  deleting a saved place removes the shares and the routes computed from them.
- Google content is stored with a 30-day expiry and purged; place IDs are kept. Photos show author attributions and
  Places data carries Google attribution.

## Project structure

```
Meetzy/
  public/                 favicon, manifest, service worker, icons/
  scripts/                test-db.mjs (PGlite runner), make-icons.mjs
  src/
    components/           common/ layout/ maps/ groups/ activities/ venues/ hangouts/ profile/
    composables/          useGeolocation, useVenueRoutes, useGroupActions
    layouts/              PublicLayout, AuthLayout, AppLayout, GroupLayout, HangoutLayout
    pages/                public/ dashboard/ profile/ settings/ groups/ hangouts/
    router/               routes + guards
    services/             supabase/ googleMaps/ places/ midpoint/ config.js
    stores/               auth, ui, groups, group, hangout, notifications (Pinia)
    styles/main.css       Tailwind 4 theme: brand palette + light/dark semantic tokens
    utils/                format, validation, errors, domain, calendar, redirect
  supabase/
    migrations/           schema, security (RLS/grants), functions (RPCs), catalogue/realtime/storage, api quota
    functions/
      _shared/engine/     the midpoint engine (pure JS, shared with the browser via the @engine alias)
      _shared/google/     Places (New) and Routes REST clients
      compute-meetup/     runs the engine, stores results
      venue-routes/       per-friend route polylines, refreshes expired Place details
    config.toml
  tests/                  unit/ functions/ db/
```
