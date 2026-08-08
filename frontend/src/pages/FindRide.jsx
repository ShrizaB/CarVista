import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import AddressAutocomplete from '../components/AddressAutocomplete';
import RouteMap from '../components/RouteMap';

const STEPS = { SEARCH: 0, CONFIRM: 1, RESULTS: 2 };

export default function FindRide() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.SEARCH);
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('09:00');
  const [seats, setSeats] = useState(1);
  const [recurring, setRecurring] = useState(false);

  const [route, setRoute] = useState(null);
  const [rides, setRides] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);

  const canContinue = pickup && destination;

  const confirmRoute = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/maps/route', { pickup: { lat: pickup.lat, lng: pickup.lng }, destination: { lat: destination.lat, lng: destination.lng } });
      setRoute(res.data.route);
      setStep(STEPS.CONFIRM);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not calculate the route.');
    } finally {
      setLoading(false);
    }
  };

  const searchRides = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.get('/rides/search', {
        params: {
          pickupLat: pickup.lat, pickupLng: pickup.lng,
          destinationLat: destination.lat, destinationLng: destination.lng,
          date, seats,
        },
      });
      setRides(res.data.rides);
      setStep(STEPS.RESULTS);
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  const book = async (rideId) => {
    setError('');
    setBooking(rideId);
    try {
      const res = await api.post('/trips/book', { rideId, seats });
      navigate(`/trips/${res.data.booking.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Booking failed.');
    } finally {
      setBooking(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Find a Ride</div>
          <h1 className="page-title">Search for a matching ride</h1>
        </div>
      </div>

      <Stepper step={step} />

      {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

      {step === STEPS.SEARCH && (
        <div className="card" style={{ marginTop: 18, maxWidth: 640 }}>
          <AddressAutocomplete label="Pickup location" value={pickup} onSelect={setPickup} />
          <AddressAutocomplete label="Destination" value={destination} onSelect={setDestination} />
          <div className="field-row">
            <div className="field">
              <label>Travel date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Travel time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Number of seats</label>
              <input type="number" min={1} max={6} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                Recurring ride
              </label>
            </div>
          </div>
          <button className="btn btn-primary btn-block" disabled={!canContinue || loading} onClick={confirmRoute}>
            {loading ? 'Calculating route…' : 'Continue → Confirm route'}
          </button>
        </div>
      )}

      {step === STEPS.CONFIRM && route && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 12 }}>Confirm your route</h3>
          <RouteMap pickup={pickup} destination={destination} geometry={route.geometry} />
          <div className="grid-3" style={{ marginTop: 16 }}>
            <MiniStat label="Distance" value={`${route.distanceKm} km`} />
            <MiniStat label="Est. duration" value={`${Math.round(route.durationMin)} min`} />
            <MiniStat label="Seats needed" value={seats} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn btn-outline" onClick={() => setStep(STEPS.SEARCH)}>← Edit search</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading} onClick={searchRides}>
              {loading ? 'Searching…' : 'Search matching rides'}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.RESULTS && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--slate)' }}>{rides?.length || 0} rides found near your route</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setStep(STEPS.CONFIRM)}>← Back to route</button>
          </div>

          {rides?.length === 0 && (
            <div className="empty-state card">
              No matching rides yet for this route and time.<br />
              Try a different time, or <a href="/offer-ride" style={{ color: 'var(--route-dark)', fontWeight: 600 }}>offer your own ride</a>.
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            {rides?.map((r) => (
              <div key={r.id} className="card card-hover">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="avatar">{r.driver_name?.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{r.driver_name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--slate)' }}>★ {Number(r.driver_rating).toFixed(1)} · {r.vehicle_model} ({r.registration_number})</div>
                      <div style={{ fontSize: 13, marginTop: 6 }}>{r.pickup_address.split(',')[0]} → {r.destination_address.split(',')[0]}</div>
                      <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>
                        {r.travel_date} · {r.travel_time?.slice(0, 5)} · {r.distance_km} km · {r.available_seats} seats left
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600 }}>₹{r.fare_per_seat}</div>
                    <div style={{ fontSize: 11, color: 'var(--slate)', marginBottom: 8 }}>per seat</div>
                    <button className="btn btn-primary btn-sm" disabled={booking === r.id} onClick={() => book(r.id)}>
                      {booking === r.id ? 'Booking…' : 'Book ride'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }) {
  const labels = ['Search', 'Confirm Route', 'Available Rides'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      {labels.map((l, i) => (
        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: i < labels.length - 1 ? 1 : 'initial' }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, flexShrink: 0,
            background: i <= step ? 'var(--route)' : 'var(--mist)', color: i <= step ? '#fff' : 'var(--slate)',
          }}>{i + 1}</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: i <= step ? 'var(--ink)' : 'var(--slate-light)', whiteSpace: 'nowrap' }}>{l}</span>
          {i < labels.length - 1 && <div className="route-line" style={{ flex: 1 }} />}
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ background: 'var(--sky)', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 16 }}>{value}</div>
    </div>
  );
}
