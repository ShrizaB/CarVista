import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';

// Default Leaflet marker icons (served from a free CDN, no key required)
const pickupIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41],
});
const destIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [30, 49], iconAnchor: [15, 49],
});

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) map.fitBounds(points, { padding: [40, 40] });
    else if (points.length === 1) map.setView(points[0], 13);
  }, [points, map]);
  return null;
}

export default function RouteMap({ pickup, destination, geometry, height = 320, liveMarker }) {
  const points = [];
  if (pickup) points.push([pickup.lat, pickup.lng]);
  if (destination) points.push([destination.lat, destination.lng]);
  const lineCoords = geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];

  const center = points[0] || [22.5726, 88.3639]; // fallback: Kolkata

  return (
    <div className="map-box" style={{ height }}>
      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />}
        {destination && <Marker position={[destination.lat, destination.lng]} icon={destIcon} />}
        {lineCoords.length > 0 && <Polyline positions={lineCoords} pathOptions={{ color: '#ff8a3d', weight: 5, opacity: 0.85 }} />}
        {liveMarker && <Marker position={[liveMarker.lat, liveMarker.lng]} />}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
