import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getSocket, connectSocket } from '../api/socket';
import RouteMap from '../components/RouteMap';
import StatusBadge from '../components/StatusBadge';
import CheckoutModal from '../components/CheckoutModal';

export default function TripDetail() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [liveLocation, setLiveLocation] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [payMethod, setPayMethod] = useState('cash');
  const [callState, setCallState] = useState('idle'); // idle | calling | ringing | in-call
  const chatEndRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const geoWatchRef = useRef(null);

  const isDriver = trip && trip.driver_id === user.id;
  const otherUserId = trip && (isDriver ? trip.passenger_id : trip.driver_id);

  const load = async () => {
    const res = await api.get(`/trips/${bookingId}`);
    setTrip(res.data.trip);
    setLoading(false);
    const msgRes = await api.get(`/trips/ride/${res.data.trip.ride_id}/messages`);
    setMessages(msgRes.data.messages);
    const locRes = await api.get(`/trips/ride/${res.data.trip.ride_id}/location`);
    if (locRes.data.location) setLiveLocation({ lat: locRes.data.location.latitude, lng: locRes.data.location.longitude });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [bookingId]);

  // ---- Socket.IO: join ride room, listen for chat + tracking + calls ----
  useEffect(() => {
    if (!trip) return;
    const socket = connectSocket();
    socket.emit('ride:join', { rideId: trip.ride_id });

    const onMessage = (msg) => setMessages((m) => [...m, msg]);
    const onLocation = (loc) => setLiveLocation({ lat: loc.latitude, lng: loc.longitude });
    const onOffer = async ({ offer, from }) => {
      setCallState('ringing');
      window.__incomingOffer = { offer, from };
    };
    const onAnswer = async ({ answer }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState('in-call');
    };
    const onIce = async ({ candidate }) => {
      try { await pcRef.current?.addIceCandidate(candidate); } catch { /* ignore */ }
    };
    const onEnd = () => endCallLocal();

    socket.on('chat:message', onMessage);
    socket.on('trip:location', onLocation);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIce);
    socket.on('call:end', onEnd);

    return () => {
      socket.emit('ride:leave', { rideId: trip.ride_id });
      socket.off('chat:message', onMessage);
      socket.off('trip:location', onLocation);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIce);
      socket.off('call:end', onEnd);
    };
    // eslint-disable-next-line
  }, [trip?.ride_id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ---- Driver: broadcast live location while trip is active ----
  useEffect(() => {
    if (!trip || !isDriver) return;
    if (!['started', 'in_progress'].includes(trip.trip_status)) return;
    if (!navigator.geolocation) return;

    geoWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const socket = getSocket();
        const payload = {
          rideId: trip.ride_id, latitude: pos.coords.latitude, longitude: pos.coords.longitude,
          heading: pos.coords.heading, speedKmph: pos.coords.speed ? pos.coords.speed * 3.6 : null,
        };
        socket.emit('trip:location', payload);
        setLiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
    return () => geoWatchRef.current && navigator.geolocation.clearWatch(geoWatchRef.current);
  }, [trip?.trip_status, isDriver]);

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    getSocket().emit('chat:send', { rideId: trip.ride_id, message: chatInput });
    setChatInput('');
  };

  // ---- Trip lifecycle (driver) ----
  const setStage = async (stage) => {
    await api.put(`/trips/ride/${trip.ride_id}/${stage}`);
    getSocket().emit('trip:status', { rideId: trip.ride_id, status: stage });
    load();
  };

  // ---- Payment ----
  const payWith = async (method) => {
    setPayMethod(method);
    if (method === 'cash' || method === 'wallet') {
      try {
        await api.post(`/payments/${bookingId}/pay`, { method });
        load();
      } catch (err) {
        alert(err.response?.data?.error || 'Payment failed.');
      }
    } else {
      setShowCheckout(true);
    }
  };

  const onCheckoutSuccess = async (paymentId) => {
    try {
      const orderRes = await api.post(`/payments/${bookingId}/order`);
      await api.post(`/payments/${bookingId}/pay`, {
        method: payMethod, gateway: orderRes.data.order.gateway, orderId: orderRes.data.order.orderId, paymentId,
      });
      setShowCheckout(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Payment failed.');
    }
  };

  // ---- WebRTC voice call (free, peer-to-peer, signaled via our own socket) ----
  const startCall = async () => {
    setCallState('calling');
    const pc = createPeerConnection();
    pcRef.current = pc;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    getSocket().emit('call:offer', { rideId: trip.ride_id, offer, to: otherUserId });
  };

  const acceptCall = async () => {
    const { offer, from } = window.__incomingOffer || {};
    const pc = createPeerConnection();
    pcRef.current = pc;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    getSocket().emit('call:answer', { rideId: trip.ride_id, answer, to: from });
    setCallState('in-call');
  };

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = (e) => {
      if (e.candidate) getSocket().emit('call:ice-candidate', { rideId: trip.ride_id, candidate: e.candidate, to: otherUserId });
    };
    pc.ontrack = (e) => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
    };
    return pc;
  };

  const endCallLocal = () => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    setCallState('idle');
  };

  const endCall = () => {
    getSocket().emit('call:end', { rideId: trip.ride_id, to: otherUserId });
    endCallLocal();
  };

  if (loading || !trip) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Trip Details</div>
          <h1 className="page-title">{trip.pickup_address.split(',')[0]} → {trip.destination_address.split(',')[0]}</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <StatusBadge status={trip.trip_status} />
            <StatusBadge status={trip.payment_status} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <RouteMap
              pickup={{ lat: trip.pickup_lat, lng: trip.pickup_lng }}
              destination={{ lat: trip.destination_lat, lng: trip.destination_lng }}
              liveMarker={liveLocation}
              height={340}
            />
            <div className="grid-3" style={{ marginTop: 14 }}>
              <MiniStat label="Distance" value={`${trip.distance_km} km`} />
              <MiniStat label="Duration" value={`${Math.round(trip.duration_min)} min`} />
              <MiniStat label="Fare" value={`₹${trip.fare_total}`} />
            </div>
          </div>

          {isDriver && ['booked', 'started', 'in_progress'].includes(trip.trip_status) && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>Trip controls</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {trip.trip_status === 'booked' && <button className="btn btn-primary" onClick={() => setStage('start')}>Start trip</button>}
                {trip.trip_status === 'started' && <button className="btn btn-primary" onClick={() => setStage('in-progress')}>Mark in progress</button>}
                {['started', 'in_progress'].includes(trip.trip_status) && (
                  <button className="btn btn-secondary" onClick={() => setStage('complete')}>Complete trip</button>
                )}
              </div>
              {['started', 'in_progress'].includes(trip.trip_status) && (
                <p className="form-hint" style={{ marginTop: 10 }}>Your live location is being shared with the passenger.</p>
              )}
            </div>
          )}

          {!isDriver && trip.trip_status === 'completed' && trip.payment_status !== 'completed' && (
            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>Complete payment</h3>
              <p style={{ fontSize: 13.5, color: 'var(--slate)', marginBottom: 14 }}>Trip completed — please pay ₹{trip.fare_total} to your driver.</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-outline" onClick={() => payWith('cash')}>💵 Cash</button>
                <button className="btn btn-outline" onClick={() => payWith('wallet')}>👛 Wallet</button>
                <button className="btn btn-outline" onClick={() => payWith('card')}>💳 Card</button>
                <button className="btn btn-outline" onClick={() => payWith('upi')}>📱 UPI</button>
              </div>
            </div>
          )}
        </div>

        <div>
          {/* Driver / passenger card + call */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="avatar" style={{ background: 'var(--route)', color: '#fff' }}>
                {(isDriver ? trip.passenger_name : trip.driver_name)?.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{isDriver ? trip.passenger_name : trip.driver_name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--slate)' }}>{isDriver ? 'Passenger' : `${trip.vehicle_model} · ${trip.registration_number}`}</div>
              </div>
            </div>
            <div className="divider" />
            {callState === 'idle' && <button className="btn btn-secondary btn-block" onClick={startCall}>📞 Call {isDriver ? 'passenger' : 'driver'}</button>}
            {callState === 'calling' && <button className="btn btn-outline btn-block" onClick={endCall}>Calling… tap to cancel</button>}
            {callState === 'ringing' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={acceptCall}>Accept call</button>
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={endCall}>Decline</button>
              </div>
            )}
            {callState === 'in-call' && <button className="btn btn-danger btn-block" onClick={endCall}>End call</button>}
            <audio ref={remoteAudioRef} autoPlay />
          </div>

          {/* Chat */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 420 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Chat</h3>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {messages.length === 0 && <div style={{ color: 'var(--slate-light)', fontSize: 13 }}>Say hello 👋</div>}
              {messages.map((m) => (
                <div key={m.id} className={`chat-bubble ${m.sender_id === user.id ? 'mine' : 'theirs'}`}>
                  {m.message}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChat} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input placeholder="Type a message…" value={chatInput} onChange={(e) => setChatInput(e.target.value)} style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--mist)', borderRadius: 10 }} />
              <button className="btn btn-primary" type="submit">Send</button>
            </form>
          </div>
        </div>
      </div>

      {showCheckout && (
        <CheckoutModal amount={trip.fare_total} onClose={() => setShowCheckout(false)} onSuccess={onCheckoutSuccess} />
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
