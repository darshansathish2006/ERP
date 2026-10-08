import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Search, X } from 'lucide-react';

const CHENNAI: [number, number] = [13.0827, 80.2707];

const pinIcon = L.divIcon({
  className: '',
  html: '<svg width="28" height="38" viewBox="0 0 28 38"><path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 38 14 38s14-13.7 14-24.1C28 6.2 21.7 0 14 0z" fill="#1565c0"/><circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>',
  iconSize: [28, 38],
  iconAnchor: [14, 38],
});

interface Place {
  display_name: string;
  lat: string;
  lon: string;
}

export function SiteMap({
  lat,
  lng,
  label,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  label: string;
  onChange: (v: { lat: number | null; lng: number | null; label: string }) => void;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const labelRef = useRef(label);
  labelRef.current = label;
  const [query, setQuery] = useState(label);
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setQuery(label), [label]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center: lat != null && lng != null ? [lat, lng] : CHENNAI, zoom: lat != null ? 15 : 10, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      onChangeRef.current({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)), label: labelRef.current || `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}` });
    });
    map.current = m;
    // Leaflet needs a size recalculation once the container is laid out.
    const t = window.setTimeout(() => m.invalidateSize(), 200);
    return () => {
      window.clearTimeout(t);
      m.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (lat == null || lng == null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current?.getLatLng();
        if (p) onChangeRef.current({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), label: labelRef.current });
      });
    } else marker.current.setLatLng([lat, lng]);
  }, [lat, lng]);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=in&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('search failed');
      setResults((await res.json()) as Place[]);
    } catch {
      setError('Location search is unavailable (no internet connection). Click on the map to drop a pin instead.');
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const choose = (p: Place) => {
    const la = Number(Number(p.lat).toFixed(6));
    const lo = Number(Number(p.lon).toFixed(6));
    onChange({ lat: la, lng: lo, label: p.display_name });
    setResults(null);
    map.current?.setView([la, lo], 16);
  };

  return (
    <div className="col gap-8">
      <div style={{ position: 'relative' }}>
        <div className="input-icon">
          <Search size={14} />
          <input
            className="input"
            placeholder="Search your site location..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
            style={{ paddingRight: 64 }}
          />
          <span className="input-suffix row gap-4">
            {searching && <span className="spinner" style={{ width: 14, height: 14 }} />}
            {(query || lat != null) && (
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                aria-label="Clear location"
                onClick={() => {
                  setQuery('');
                  setResults(null);
                  onChange({ lat: null, lng: null, label: '' });
                }}
              >
                <X size={14} />
              </button>
            )}
          </span>
        </div>
        {results && (
          <div className="map-results">
            {results.length === 0 && <div className="map-result muted">No places found</div>}
            {results.map((p) => (
              <div key={`${p.lat},${p.lon}`} className="map-result row gap-4" onClick={() => choose(p)}>
                <MapPin size={13} color="var(--primary)" style={{ flex: 'none' }} />
                <span>{p.display_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {error && <div className="field-hint">{error}</div>}
      <div ref={el} className="site-map" />
      <div className="field-hint">{lat != null && lng != null ? `Pinned at ${lat}, ${lng} – drag the pin to adjust.` : 'Search for the site or click on the map to drop a pin.'}</div>
    </div>
  );
}
