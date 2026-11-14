import { assert, rejects, q, svc } from './helpers.mjs'

const quota = (h, userId, max = 3) =>
  svc(h, "select public.consume_api_quota($1, 'venue_routes', $2, 3600)", [userId, max])

export const tests = [
  {
    name: 'consume_api_quota is callable only by the service role',
    async fn(h) {
      const user = await h.createUser('Quota User')
      await rejects(q(h, user, "select public.consume_api_quota($1, 'venue_routes', 5, 3600)", [user]), /permission denied/)
      await rejects(
        h.as(null, (db) => db.query("select public.consume_api_quota($1, 'venue_routes', 5, 3600)", [user])),
        /permission denied/,
      )
    },
  },
  {
    name: 'consume_api_quota allows up to the limit, then raises rate_limited',
    async fn(h) {
      const user = await h.createUser('Route Fan')
      await quota(h, user)
      await quota(h, user)
      await quota(h, user)
      await rejects(quota(h, user), /rate_limited/)
      // Another user has their own budget.
      const other = await h.createUser('Other Fan')
      await quota(h, other)
      assert.ok(true)
    },
  },
  {
    name: 'consume_api_quota rejects malformed requests',
    async fn(h) {
      const user = await h.createUser('Bad Request')
      await rejects(svc(h, "select public.consume_api_quota($1, 'DROP TABLE', 5, 3600)", [user]), /invalid_input/)
      await rejects(svc(h, "select public.consume_api_quota($1, 'venue_routes', 0, 3600)", [user]), /invalid_input/)
    },
  },
]
