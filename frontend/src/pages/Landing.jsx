import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--dusk)', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 6vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="brand-mark">CV</div>
          <div className="brand-name" style={{ fontSize: 20 }}>CarVista</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/login" className="btn btn-ghost" style={{ color: '#fff' }}>Log in</Link>
          <Link to="/register" className="btn btn-primary">Get started</Link>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '4vh 6vw', gap: '5vw', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px' }}>
          <div className="eyebrow" style={{ color: 'var(--route)' }}>Enterprise Carpooling Platform</div>
          <h1 style={{ fontSize: 'clamp(34px, 5vw, 54px)', lineHeight: 1.05, margin: '14px 0 18px' }}>
            Your commute,<br />shared with your team.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 17, maxWidth: 480, lineHeight: 1.6 }}>
            CarVista connects employees at your organization so they can find and offer rides,
            track journeys live, split fares, and cut commute costs — together.
          </p>
          <div className="route-line" style={{ width: 220, margin: '26px 0' }} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/register" className="btn btn-primary">Register your organization</Link>
            <Link to="/login" className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}>
              Employee sign in
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 26, marginTop: 40, flexWrap: 'wrap' }}>
            {[
              ['Find a Ride', 'Instant matching by route & schedule'],
              ['Offer a Ride', 'Publish seats in your own vehicle'],
              ['Live Tracking', 'Real-time map, ETA & chat'],
            ].map(([t, d]) => (
              <div key={t} style={{ maxWidth: 190 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{t}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: '1 1 360px' }} className="card" >
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              ['🔍', 'Find a Ride', 'Search rides matching your route, date & time'],
              ['🧭', 'Offer a Ride', 'Publish your commute and share seats'],
              ['📍', 'Live Trip Tracking', 'Follow the journey on a live map'],
              ['💳', 'Wallet & Payments', 'Cash, card, UPI or wallet'],
              ['📊', 'Reports & Analytics', 'Cost per km, fuel & travel trends'],
            ].map(([icon, t, d]) => (
              <div key={t} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '10px 4px' }}>
                <div style={{ fontSize: 22 }}>{icon}</div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{t}</div>
                  <div style={{ fontSize: 13, color: 'var(--slate)' }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
