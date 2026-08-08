const express = require('express');
const { authRequired } = require('../middleware/auth');
const { geocodeAddress, reverseGeocode, getRoute } = require('../utils/maps');

const router = express.Router();
router.use(authRequired);

// GET /api/maps/geocode?q=Salt+Lake+Sector+5
router.get('/geocode', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 3) return res.json({ results: [] });
  try {
    const results = await geocodeAddress(q);
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Address lookup service is temporarily unavailable.' });
  }
});

// GET /api/maps/reverse-geocode?lat=..&lng=..
router.get('/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required.' });
  try {
    const address = await reverseGeocode(lat, lng);
    res.json({ address });
  } catch (err) {
    res.status(502).json({ error: 'Reverse geocoding service is temporarily unavailable.' });
  }
});

// POST /api/maps/route  { pickup:{lat,lng}, destination:{lat,lng} }
// Used by both "Find a Ride" and "Offer a Ride" for the Route Confirmation screen.
router.post('/route', async (req, res) => {
  const { pickup, destination } = req.body;
  if (!pickup?.lat || !destination?.lat) {
    return res.status(400).json({ error: 'pickup and destination coordinates are required.' });
  }
  try {
    const route = await getRoute(pickup, destination);
    res.json({ route });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Routing service is temporarily unavailable.' });
  }
});

module.exports = router;
