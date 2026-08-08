import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import AddressAutocomplete from '../components/AddressAutocomplete';
import RouteMap from '../components/RouteMap';

const STEPS = { DETAILS: 0, CONFIRM: 1, DONE: 2 };

export default function OfferRide() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState(null);
  const [step, setStep] = useState(STEPS.DETAILS);
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('09:00');
  const [seats, setSeats] = useState(2);
  const [fare, setFare] = useState('');
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [publishedRide, setPublishedRide] = useState(null);

  useEffect(() => {
    api.get('/vehicles').then((res) => setVehicles(res.data.vehicles));
  }, []);

  const selectedVehicle = vehicles?.find((v) => v.id === vehicleId);

  const confirmRoute = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/maps/route', { pickup: { lat: pickup.lat, lng: pickup.lng }, destination: { lat: destination.lat, lng: destination.lng } });
      setRoute(res.data.route);
      if (!fare) setFare(String(Math.round(res.data.route.distanceKm * 8)));
      setStep(STEPS.CONFIRM);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not calculate the route.');
    } finally {
      setLoading(false);
    }
  };

  const publish = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/rides', {
        vehicleId, pickupAddress: pickup.displayName, pickupLat: pickup.lat, pickupLng: pickup.lng,
        destinationAddress: destination.displayName, destinationLat: destination.lat, destinationLng: destination.lng,
        travelDate: date, travelTime: time, availableSeats: seats, farePerSeat: fare,
      });
      setPublishedRide(res.data.ride);
      setStep(STEPS.DONE);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not publish ride.');
    } finally {
      setLoading(false);
    }
  };

  if (vehicles && vehicles.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="eyebrow">Offer a Ride</div>
            <h1 className="page-title">Register a vehicle first</h1>
          </div>
        </div>
        <div className="card empty-state">
          You need at least one registered vehicle before you can publish a ride.
          <div style={{ marginTop: 14 }}>
            <Link to="/vehicles" className="btn btn-primary">Register a vehicle</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Offer a Ride</div>
          <h1 className="page-title">Publish your commute</h1>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

      {step === STEPS.DETAILS && (
        <div className="card" style={{ marginTop: 18, maxWidth: 640 }}>
          <div className="field">
            <label>Vehicle</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Select a registered vehicle…</option>
              {vehicles?.map((v) => (
                <option key={v.id} value={v.id}>{v.model} — {v.registration_number} ({v.seating_capacity} seats)</option>
              ))}
            </select>
          </div>
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
              <label>Available seats</label>
              <input type="number" min={1} max={selectedVehicle?.seating_capacity || 6} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
              {selectedVehicle && <div className="form-hint">Max {selectedVehicle.seating_capacity} for this vehicle</div>}
            </div>
            <div className="field">
              <label>Fare per seat (₹)</label>
              <input type="number" min={0} value={fare} onChange={(e) => setFare(e.target.value)} placeholder="Auto-suggested after route" />
            </div>
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={!vehicleId || !pickup || !destination || loading}
            onClick={confirmRoute}
          >
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
            <MiniStat label="Fare per seat" value={`₹${fare}`} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn btn-outline" onClick={() => setStep(STEPS.DETAILS)}>← Edit details</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading} onClick={publish}>
              {loading ? 'Publishing…' : 'Publish ride'}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.DONE && publishedRide && (
        <div className="card" style={{ marginTop: 18, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <h3>Ride published</h3>
          <p style={{ color: 'var(--slate)', marginTop: 6 }}>Your ride is now visible to matching passengers.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <button className="btn btn-outline" onClick={() => navigate('/trips')}>View My Trips</button>
            <button className="btn btn-primary" onClick={() => { setStep(STEPS.DETAILS); setPublishedRide(null); setRoute(null); setPickup(null); setDestination(null); }}>
              Publish another ride
            </button>
          </div>
        </div>
      )}
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
