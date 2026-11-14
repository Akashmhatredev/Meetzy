# Meetzy architecture

## Overview

```
Browser: Vue 3 SPA (installable PWA)
 ├─ Pinia stores ── services/supabase ── PostgREST + RLS ──► Postgres (tables, RPCs, triggers)
 │                                    ◄── Realtime ────────  (members, votes, locations, venues, notifications)
 ├─ services/googleMaps (browser key, referrer-restricted)
 │     Maps JS map, Advanced Markers, Places autocomplete, optional reverse geocoding
 └─ services/midpoint ── functions.invoke ──► Edge Function compute-meetup (server key)
                                              ├─ _shared/engine   pure JS, no Deno or DOM APIs
                                              ├─ Places API (New) Text Search, photo URIs
                                              └─ Routes API computeRouteMatrix
                       ── functions.invoke ──► Edge Function venue-routes
                                              ├─ Routes API computeRoutes (polylines)
                                              └─ Places API (New) Place Details (refresh after purge)
```

The browser never sees the Google server key or the Supabase service-role key. Everything the engine writes goes
through service-role RPCs (`start_calculation`, `complete_calculation`, `fail_calculation`) that clients cannot call.

## The midpoint engine

`supabase/functions/_shared/engine/` is plain ES modules imported by the Edge Function (Deno), by Vitest (Node) and,
for ranking and explanations, by the browser (`@engine` alias), so the browser re-ranks without calling Google
again.

1. **Participants.** Only members who explicitly shared a location for this hangout (`hangout_locations`) are
   included. Missing members are listed in the UI with a "nudge" action, never dropped silently. Requires 2–25.
2. **Centre.** Spherical centroid (3D vector average) plus the geometric median (Weiszfeld).
3. **Candidate areas.** Centroid, median (if it differs by more than 150 m) and a ring of points around the centre
   sized to the group's spread (0.3 × spread, clamped to 0.8–8 km), deduplicated, and limited so that
   `participants × areas` fits Google's matrix element budget (625; 100 for transit).
4. **Area pass.** One Compute Route Matrix call from every participant to every candidate area. The best area is
   chosen by the hangout's strategy, preferring areas everyone can reach.
5. **Venue search.** Places Text Search per activity (catalogue queries such as "cafe", "go karting track", or the
   custom activity's name) biased to a circle around the best area; results are deduplicated, closed businesses and
   far-away results dropped. If nothing matches, the next-best area is tried once.
6. **Venue pass.** Up to `min(25, budget / participants)` venues, picked round-robin across activities, then a second
   route matrix from every participant to every venue.
7. **Ranking.** For each venue: average, longest, shortest, total and spread of travel times, reachable count and
   whether every trip is within the optional time limit.
   - **Fair** minimises the longest trip (tie-break: average).
   - **Balanced** minimises the average trip (tie-break: longest).
   - **Fastest** minimises total group travel (tie-break: longest).

   Venues with a route for everyone rank above incomplete ones; incomplete venues show *which* friend has no route
   instead of an estimate.
8. **Explanation.** Sentences are generated only from those numbers ("Everyone can get here within about 25 min…").
9. **Caching.** Inputs (participants and coordinates, activities, mode, strategy, departure bucket, time limit) are
   hashed. An identical successful run from the last 20 minutes is reused without any Google calls. Changes to
   locations, activities or settings set `hangouts.inputs_changed_at`, and the UI offers a recalculation.

## Data model

| Table | Purpose | Who can read | Who writes |
| --- | --- | --- | --- |
| `profiles` | name, avatar, preferred travel mode (email hidden by column grants) | self + group mates | self (columns) |
| `user_locations` | saved places | owner only | owner |
| `groups`, `group_members`, `group_invitations` | groups, roles, per-group sharing opt-in, invite codes | members | admins (group columns), RPCs |
| `hangouts` | plan, status, strategy, travel mode, time limit, deadline, chosen venue, meeting point | members | organiser (columns), RPCs |
| `hangout_locations` | a member's explicit share for one hangout | members | RPCs (own row) |
| `activities`, `hangout_activities`, `activity_votes` | catalogue + custom activities, shortlist, votes | members (catalogue: all) | RPCs |
| `calculation_runs` | engine runs: input hash, centre, chosen area, area metrics, counts, warnings, errors | members | service role |
| `venues`, `venue_routes` | ranked venues with travel metrics; per-member times and polylines | members | service role |
| `venue_votes` | one vote per member per hangout | members | RPCs |
| `notifications` | in-app notifications | owner | triggers/RPCs; owner marks read/deletes |
| `private.rate_limits` | fixed-window counters | nobody via API | definer functions |

Status flow: `waiting_for_locations` → `activity_selection` → (`calculating`) → `venue_discovery` → `voting` →
`finalized`; `cancelled` from any open state, restorable. Locations and activities can change at any open stage.
`draft` exists in the enum for future use.

## Front end

- **Layouts.** `PublicLayout` (marketing), `AuthLayout` (forms + brand panel), `AppLayout` (desktop sidebar, mobile
  top bar + bottom navigation with a central "plan" action). `GroupLayout` and `HangoutLayout` own the Realtime
  channel for the open group or hangout and render child pages, so every planning step shares one live store.
- **Stores.** `auth` (session, profile, saved places), `ui` (theme, toasts, confirm), `groups` (my groups and recent
  hangouts), `group`, `hangout` (all hangout data plus derived state: people with route colours, activity tallies,
  ranked venues, vote counts and leader, step progress), `notifications`.
- **Realtime.** One channel per open group or hangout. Inserts and updates are filtered by `group_id` or
  `hangout_id`; deletes can't be filtered by Supabase, so they're matched against local ids. Bursts are debounced
  into targeted reloads.
- **Maps.** `MapCanvas` lazy-loads the Maps JS API on first use (`loading=async`), follows the theme via
  `colorScheme`, and shows an honest "not configured" or "key rejected" state. `GroupMap` diffs Advanced Markers by
  key and draws route polylines in each member's colour. All marker content is built with `textContent`.
- **Design tokens.** `src/styles/main.css` defines the fixed brand palette (mint `#65D6A4`, navy `#101827`,
  lavender, sky, warm orange, rose) and semantic tokens (`canvas`, `surface`, `ink`, `muted`, `line`, `accent`, …)
  that switch under `.dark`. Fonts: Plus Jakarta Sans (display) and Inter (text), self-hosted.

## Google Maps Platform terms

- Place IDs are stored indefinitely; other Places/Routes content gets `content_expires_at = now + 30 days`.
  `purge_expired_google_content()` (schedule with pg_cron) deletes expired venues and scrubs the chosen venue of a
  finalised plan down to its place ID; the confirmation page then offers "Refresh from Google".
- Photos are fetched as `photoUri` (no key in the URL) and shown with the author attribution; Places data lists carry
  a Google attribution line; the autocomplete dropdown shows "Powered by Google".
