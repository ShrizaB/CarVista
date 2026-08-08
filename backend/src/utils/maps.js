const fetch = require('node-fetch');

const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const PHOTON_BASE_URL = process.env.PHOTON_BASE_URL || 'https://photon.komoot.io';
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'CarVista-Carpooling-App/1.0';

// Public demo servers can be slow, rate-limited, or briefly unreachable.
// Without a timeout a hung request left the frontend spinner spinning
// forever with no feedback.
const FETCH_TIMEOUT_MS = 8000;

// -----------------------------------------------------------------------
// Small in-memory cache so retyping/re-selecting the same address (very
// common while a user is adjusting date/time/seats) doesn't re-hit the
// external service every time.
// -----------------------------------------------------------------------
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const geocodeCache = new Map();

// -----------------------------------------------------------------------
// Nominatim's usage policy caps requests at ~1/sec *and* separately bans
// "auto-complete style searches" outright - typing "Espla", "Esplan",
// "Esplana", "Esplanade" and geocoding each one (exactly what this
// autocomplete box does) is the banned pattern itself, not just a
// volume issue. Their servers detect it and return 403, no matter how
// well-spaced the requests are. Throttling below still protects the
// *fallback* Nominatim path and reverse-geocoding, but the primary path
// for live typing is now Photon (https://photon.komoot.io), a free,
// keyless geocoder built on the same OSM data that is explicitly
// designed for typeahead/autocomplete use.
// -----------------------------------------------------------------------
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;
let queueTail = Promise.resolve();

function throttle(fn) {
  const run = async () => {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return fn();
  };
  const next = queueTail.then(run, run);
  queueTail = next.catch(() => {});
  return next;
}

async function fetchWithTimeout(url, options = {}, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (attempt < 2 && (err.name === 'AbortError' || err.type === 'system')) {
      return fetchWithTimeout(url, options, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Geocode via Photon (komoot) - free, no API key, and unlike raw
 * Nominatim it's actually meant to be called on every keystroke.
 */
async function geocodeViaPhoton(query) {
  const url = `${PHOTON_BASE_URL}/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Photon geocoding failed (status ${res.status}).`);
  const data = await res.json();
  return (data.features || [])
    .filter((f) => f.geometry?.coordinates?.length === 2)
    .map((f) => {
      const p = f.properties || {};
      const parts = [p.name, p.street, p.district, p.city, p.state, p.country].filter(Boolean);
      // de-dupe consecutive identical parts (e.g. name === city)
      const displayName = parts.filter((part, i) => part !== parts[i - 1]).join(', ');
      return {
        displayName: displayName || p.name || query,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      };
    });
}

/**
 * Fallback geocode via Nominatim directly - kept as a secondary path
 * (rate-limited/queued) for when Photon itself is unreachable. Not
 * used for the live-typing path under normal conditions.
 */
async function geocodeViaNominatim(query) {
  const url = `${NOMINATIM_BASE_URL}/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`;
  const res = await throttle(() => fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }));
  if (!res.ok) throw new Error(`Nominatim geocoding failed (status ${res.status}).`);
  const data = await res.json();
  return data.map((d) => ({
    displayName: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}

async function geocodeAddress(query) {
  const cacheKey = query.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;

  let results;
  try {
    results = await geocodeViaPhoton(query);
  } catch (photonErr) {
    console.warn('Photon geocoding failed, falling back to Nominatim:', photonErr.message);
    results = await geocodeViaNominatim(query);
  }
  geocodeCache.set(cacheKey, { results, at: Date.now() });
  return results;
}

/**
 * Reverse geocode lat/lng into a human-readable address. This is called
 * rarely (once per map click / GPS fix), not per-keystroke, so plain
 * Nominatim (throttled) is fine here.
 */
async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lng}`;
  const res = await throttle(() => fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }));
  if (!res.ok) throw new Error(`Reverse geocoding service unavailable (status ${res.status}).`);
  const data = await res.json();
  return data.display_name || `${lat}, ${lng}`;
}

/**
 * Get a driving route (geometry, distance, duration) between two points
 * using the free public OSRM demo server. No API key required.
 *
 * If OSRM is slow, down, or rate-limited, fall back to a straight-line
 * estimate so "Confirm route" can still proceed.
 */
async function getRoute(pickup, destination) {
  const coords = `${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}`;
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Routing service responded with status ${res.status}.`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found.');
    const route = data.routes[0];
    return {
      geometry: route.geometry,
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      durationMin: Number((route.duration / 60).toFixed(1)),
      estimated: false,
    };
  } catch (err) {
    const distanceKm = haversineKm(pickup, destination);
    return {
      geometry: {
        type: 'LineString',
        coordinates: [[pickup.lng, pickup.lat], [destination.lng, destination.lat]],
      },
      distanceKm: Number(distanceKm.toFixed(2)),
      durationMin: Number(((distanceKm / 35) * 60).toFixed(1)),
      estimated: true,
    };
  }
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

module.exports = { geocodeAddress, reverseGeocode, getRoute, haversineKm };