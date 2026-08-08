import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';

export default function AddressAutocomplete({ label, placeholder, value, onSelect }) {
  const [query, setQuery] = useState(value?.displayName || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const runSearch = useCallback(async (q) => {
    // Cancel any request still in flight so a slow earlier response can't
    // clobber a newer one (was a source of flaky/wrong dropdown results).
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    try {
      const res = await api.get('/maps/geocode', { params: { q }, signal: controller.signal });
      setResults(res.data.results);
      setSearched(true);
      setOpen(true);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
      // Previously this failed silently (empty catch), so a down/slow/
      // rate-limited location service just looked like nothing happening
      // when you typed. Now we tell the user and let them retry.
      setResults([]);
      setSearched(true);
      setError(
        err.response?.data?.error ||
          'Couldn\u2019t look up that location. Check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setError('');
    if (query.trim().length < 3) {
      setResults([]);
      setSearched(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(query.trim()), 500);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  const selectResult = (r) => {
    setQuery(r.displayName);
    setOpen(false);
    setError('');
    onSelect(r);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      // A user who types a place and hits Enter (instead of clicking the
      // dropdown) previously got nothing - pickup/destination stayed
      // unset and "Continue"/"Confirm" stayed disabled with no clue why.
      e.preventDefault();
      if (results.length > 0) selectResult(results[0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="field" style={{ position: 'relative' }}>
      {label && <label>{label}</label>}
      <input
        placeholder={placeholder || 'Search for a location…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
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
              onMouseDown={() => selectResult(r)}
              style={{ padding: '10px 13px', fontSize: 13.5, cursor: 'pointer', borderBottom: i < results.length - 1 ? '1px solid var(--sky)' : 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sky)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              {r.displayName}
            </div>
          ))}
        </div>
      )}
      {!loading && error && (
        <div style={{ fontSize: 12, color: '#c0392b', marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => runSearch(query.trim())}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--route-dark)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && searched && results.length === 0 && query.trim().length >= 3 && (
        <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 5 }}>
          No matches found. Try a nearby landmark, locality, or city name.
        </div>
      )}
    </div>
  );
}