/**
 * Test doubles for the Edge Function handlers: a tiny in-memory stand-in
 * for the supabase-js query builder and a fake fetch that answers the
 * Google endpoints. Used only by tests/functions.
 */
import { haversineMeters, destinationPoint } from '../../supabase/functions/_shared/engine/geo.js'

export function createFakeSupabase({ tables = {}, users = {}, rpc = {} } = {}) {
  const calls = { rpc: [], updates: [], upserts: [], createClient: [] }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.op = 'select'
      this.payload = null
      this.single = null
      this.max = null
    }
    select() {
      return this
    }
    eq(column, value) {
      this.filters.push([column, value])
      return this
    }
    limit(n) {
      this.max = n
      return this
    }
    maybeSingle() {
      this.single = 'maybe'
      return this
    }
    single() {
      this.single = 'single'
      return this
    }
    update(payload) {
      this.op = 'update'
      this.payload = payload
      return this
    }
    upsert(payload, options) {
      this.op = 'upsert'
      this.payload = payload
      this.options = options
      return this
    }
    then(resolve, reject) {
      return Promise.resolve()
        .then(() => this.execute())
        .then(resolve, reject)
    }
    execute() {
      const rows = (tables[this.table] ?? []).filter((row) => this.filters.every(([c, v]) => row[c] === v))
      if (this.op === 'update') {
        calls.updates.push({ table: this.table, payload: this.payload, filters: this.filters })
        rows.forEach((row) => Object.assign(row, this.payload))
        return { data: this.single ? (rows[0] ?? null) : rows, error: null }
      }
      if (this.op === 'upsert') {
        calls.upserts.push({ table: this.table, payload: this.payload, options: this.options })
        return { data: null, error: null }
      }
      let data = this.max ? rows.slice(0, this.max) : rows
      if (this.single) data = data[0] ?? null
      return { data: structuredClone(data), error: null }
    }
  }

  const client = {
    from: (table) => new Query(table),
    rpc: async (name, args) => {
      calls.rpc.push({ name, args })
      const handler = rpc[name]
      return handler ? handler(args) : { data: null, error: null }
    },
    auth: {
      getUser: async (token) =>
        users[token]
          ? { data: { user: users[token] }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } },
    },
  }

  const createClient = (url, key, options) => {
    calls.createClient.push({ url, key, options })
    return client
  }
  return { client, createClient, calls, tables }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/**
 * Fake fetch for the Google APIs. Travel times are distance / 10 m/s;
 * venues are generated around the search centre.
 */
export function createFakeGoogle({ failMatrix = null } = {}) {
  const requests = []
  const fetch = async (url, init = {}) => {
    const href = String(url)
    const headers = init.headers ?? {}
    const body = init.body ? JSON.parse(init.body) : null
    requests.push({ url: href, method: init.method, headers, body })

    if (href.includes('distanceMatrix/v2:computeRouteMatrix')) {
      if (failMatrix) return jsonResponse(failMatrix.body, failMatrix.status)
      const point = (w) => ({ lat: w.waypoint.location.latLng.latitude, lng: w.waypoint.location.latLng.longitude })
      const elements = []
      body.origins.forEach((o, oi) =>
        body.destinations.forEach((d, di) => {
          const meters = Math.round(haversineMeters(point(o), point(d)))
          elements.push({
            originIndex: oi,
            destinationIndex: di,
            duration: `${Math.round(meters / 10)}s`,
            distanceMeters: meters,
            condition: 'ROUTE_EXISTS',
          })
        }),
      )
      return jsonResponse(elements)
    }

    if (href.endsWith('places:searchText')) {
      const c = { lat: body.locationBias.circle.center.latitude, lng: body.locationBias.circle.center.longitude }
      const slug = body.textQuery.replace(/\W+/g, '')
      const places = [0, 120, 240].map((bearing, i) => {
        const p = destinationPoint(c, bearing, 400 + i * 300)
        return {
          id: `ChIJ${slug}${i}xxxxxxxx`,
          displayName: { text: `${body.textQuery} ${i}`, languageCode: 'en' },
          formattedAddress: `${i} Test Street`,
          location: { latitude: p.lat, longitude: p.lng },
          rating: 4 + i / 10,
          userRatingCount: 100 + i,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          primaryType: 'cafe',
          primaryTypeDisplayName: { text: 'Cafe' },
          googleMapsUri: `https://maps.google.com/?cid=${slug}${i}`,
          photos: [
            {
              name: `places/ChIJ${slug}${i}xxxxxxxx/photos/photo${i}`,
              authorAttributions: [{ displayName: 'A Photographer', uri: 'https://maps.google.com/maps/contrib/1' }],
            },
          ],
          regularOpeningHours: { weekdayDescriptions: ['Monday: 9:00 AM – 10:00 PM'] },
          currentOpeningHours: { openNow: true },
          businessStatus: 'OPERATIONAL',
        }
      })
      return jsonResponse({ places })
    }

    if (href.includes('/media?')) {
      return jsonResponse({ name: 'x', photoUri: 'https://lh3.googleusercontent.com/fake-photo' })
    }

    if (href.includes('directions/v2:computeRoutes')) {
      return jsonResponse({ routes: [{ duration: '900s', distanceMeters: 9000, polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } }] })
    }

    if (href.includes('places.googleapis.com/v1/places/')) {
      return jsonResponse({
        id: 'ChIJrefreshed',
        displayName: { text: 'Refreshed Cafe' },
        formattedAddress: '1 Fresh Road',
        location: { latitude: 18.55, longitude: 73.85 },
        rating: 4.4,
        userRatingCount: 321,
        businessStatus: 'OPERATIONAL',
      })
    }

    return jsonResponse({ error: { status: 'NOT_FOUND', message: 'unknown test endpoint' } }, 404)
  }
  return { fetch, requests }
}

export function envFrom(values) {
  return (key) => values[key]
}

export function post(body, { token = 'token-alice', origin = 'http://localhost:5190', method = 'POST' } = {}) {
  const headers = { 'content-type': 'application/json', origin }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request('https://example.supabase.co/functions/v1/x', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}
