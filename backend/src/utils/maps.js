const fetch = require('node-fetch');

const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'CarVista-Carpooling-App/1.0';

/**
 * Geocode a free-text address into lat/lng using the free OpenStreetMap
 * Nominatim API. No API key required. Please respect Nominatim's usage
 * policy (max 1 request/sec) in production.
 */
async function geocodeAddress(query) {
  const url = `${NOMINATIM_BASE_URL}/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error('Geocoding service unavailable.');
  const data = await res.json();
  return data.map((d) => ({
    displayName: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}

/**
 * Reverse geocode lat/lng into a human-readable address.
 */
async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error('Reverse geocoding service unavailable.');
  const data = await res.json();
  return data.display_name || `${lat}, ${lng}`;
}

/**
 * Get a driving route (geometry, distance, duration) between two points
 * using the free public OSRM demo server. No API key required.
 */
async function getRoute(pickup, destination) {
  const coords = `${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}`;
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Routing service unavailable.');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    // Fall back to a straight-line estimate if OSRM can't find a road route
    const distanceKm = haversineKm(pickup, destination);
    return {
      geometry: {
        type: 'LineString',
        coordinates: [[pickup.lng, pickup.lat], [destination.lng, destination.lat]],
      },
      distanceKm: Number(distanceKm.toFixed(2)),
      durationMin: Number(((distanceKm / 35) * 60).toFixed(1)), // assume 35km/h avg
      estimated: true,
    };
  }
  const route = data.routes[0];
  return {
    geometry: route.geometry,
    distanceKm: Number((route.distance / 1000).toFixed(2)),
    durationMin: Number((route.duration / 60).toFixed(1)),
    estimated: false,
  };
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
