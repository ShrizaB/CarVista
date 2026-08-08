import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

export default function AddressAutocomplete({ label, placeholder, value, onSelect }) {
  const [query, setQuery] = useState(value?.displayName || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get('/maps/geocode', { params: { q: query } });
        setResults(res.data.results);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div className="field" style={{ position: 'relative' }}>
      {label && <label>{label}</label>}
      <input
        placeholder={placeholder || 'Search for a location…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && (
        <div style={{ position: 'absolute', right: 12, top: 38 }}>
          <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
        </div>
      )}
      {open && results.length > 0 && (
        <div
          style={{
            position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, background: '#fff',
            border: '1px solid var(--mist)', borderRadius: 10, marginTop: 4, boxShadow: 'var(--shadow-md)',
            maxHeight: 220, overflowY: 'auto',
          }}
        >
          {results.map((r, i) => (
            <div
              key={i}
              onMouseDown={() => {
                setQuery(r.displayName);
                setOpen(false);
                onSelect(r);
              }}
              style={{ padding: '10px 13px', fontSize: 13.5, cursor: 'pointer', borderBottom: i < results.length - 1 ? '1px solid var(--sky)' : 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sky)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              {r.displayName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
