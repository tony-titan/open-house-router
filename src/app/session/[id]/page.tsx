'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import Papa from 'papaparse';
import { SessionData, House, HousePrefStatus, formatDayKey } from '@/types';
import { useAdGate } from '@/components/AdGateProvider';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const { data, error, mutate } = useSWR<SessionData>(`/api/sessions/${sessionId}`, fetcher, {
    refreshInterval: 5000,
  });

  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [startAddress, setStartAddress] = useState('');
  const [timePerStop, setTimePerStop] = useState(5);
  const [dayStartHour, setDayStartHour] = useState('09:00');
  const [dayEndHour, setDayEndHour] = useState('17:00');
  const [optimizing, setOptimizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [settingLocation, setSettingLocation] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [activeTab, setActiveTab] = useState<'plan' | 'houses'>('plan');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'price-asc' | 'price-desc' | 'address'>('time');
  const [highlightHouseId, setHighlightHouseId] = useState<number | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/Los_Angeles'; }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { requireAd } = useAdGate();

  useEffect(() => {
    const stored = localStorage.getItem(`member_${sessionId}`);
    if (stored) {
      setMemberId(stored);
    } else {
      setShowJoin(true);
    }
  }, [sessionId]);

  useEffect(() => {
    if (data?.available_days?.length && !selectedDay) {
      setSelectedDay(data.available_days[0]);
    }
  }, [data?.available_days, selectedDay]);

  const currentMember = useMemo(
    () => data?.members?.find((m) => m.id === memberId) ?? null,
    [data?.members, memberId]
  );

  useEffect(() => {
    if (currentMember) {
      setTimePerStop(currentMember.time_per_stop || 5);
      if (currentMember.start_address) setStartAddress(currentMember.start_address);
    }
  }, [currentMember]);

  // Build preference map for current member
  const housePrefs = useMemo(() => {
    const map = new Map<number, HousePrefStatus>();
    if (!data?.preferences || !memberId) return map;
    const myPrefs = data.preferences[memberId] || [];
    for (const p of myPrefs) {
      map.set(p.house_id, p.status as HousePrefStatus);
    }
    return map;
  }, [data?.preferences, memberId]);

  const claimedHouseIds = useMemo(() => {
    const ids = new Set<number>();
    if (!data?.routes || !memberId) return ids;
    data.routes
      .filter((r) => r.member_id !== memberId)
      .forEach((r) => r.stops.forEach((s) => ids.add(s.house_id)));
    return ids;
  }, [data?.routes, memberId]);

  const currentMemberRoutes = useMemo(() => {
    if (!data?.routes || !memberId) return [];
    return data.routes.filter((r) => r.member_id === memberId);
  }, [data?.routes, memberId]);

  const currentDayRoute = useMemo(() => {
    if (!selectedDay) return null;
    return currentMemberRoutes.find((r) => r.day_date === selectedDay) ?? null;
  }, [currentMemberRoutes, selectedDay]);

  // Route stop house IDs for the current member's current day route
  const myRouteHouseIds = useMemo(() => {
    const ids = new Set<number>();
    currentDayRoute?.stops.forEach((s) => ids.add(s.house_id));
    return ids;
  }, [currentDayRoute]);

  // Houses filtered for current day
  const dayHouses = useMemo(() => {
    if (!data?.houses || !selectedDay) return [];
    return data.houses.filter((h) => h.day_key === selectedDay);
  }, [data?.houses, selectedDay]);

  // Filtered and sorted house list
  const filteredHouses = useMemo(() => {
    let houses = dayHouses;

    if (!showExcluded) {
      houses = houses.filter((h) => housePrefs.get(h.id) !== 'excluded');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      houses = houses.filter(
        (h) =>
          h.address.toLowerCase().includes(q) ||
          h.city.toLowerCase().includes(q) ||
          h.zip.includes(q) ||
          h.property_type.toLowerCase().includes(q)
      );
    }

    const sorted = [...houses];
    switch (sortBy) {
      case 'price-asc':
        sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-desc':
        sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'address':
        sorted.sort((a, b) => a.address.localeCompare(b.address));
        break;
      case 'time':
        sorted.sort((a, b) => new Date(a.open_house_start).getTime() - new Date(b.open_house_start).getTime());
        break;
    }

    // Favorited first, then on-route, then default, then excluded
    sorted.sort((a, b) => {
      const prefA = housePrefs.get(a.id) || 'default';
      const prefB = housePrefs.get(b.id) || 'default';
      const orderMap: Record<string, number> = { favorited: 0, default: 1, excluded: 2 };
      const onRouteA = myRouteHouseIds.has(a.id) ? -0.5 : 0;
      const onRouteB = myRouteHouseIds.has(b.id) ? -0.5 : 0;
      return (orderMap[prefA] + onRouteA) - (orderMap[prefB] + onRouteB);
    });

    return sorted;
  }, [dayHouses, searchQuery, sortBy, housePrefs, showExcluded, myRouteHouseIds]);

  const favoritedCount = useMemo(
    () => dayHouses.filter((h) => housePrefs.get(h.id) === 'favorited').length,
    [dayHouses, housePrefs]
  );
  const excludedCount = useMemo(
    () => dayHouses.filter((h) => housePrefs.get(h.id) === 'excluded').length,
    [dayHouses, housePrefs]
  );

  async function handleJoin() {
    if (!memberName.trim()) return;
    await requireAd();
    try {
      const res = await fetch(`/api/sessions/${sessionId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: memberName.trim() }),
      });
      const member = await res.json();
      localStorage.setItem(`member_${sessionId}`, member.id);
      setMemberId(member.id);
      setShowJoin(false);
      mutate();
    } catch (e: any) {
      setStatusMessage(`Error joining: ${e.message}`);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await requireAd();
    setUploading(true);
    setStatusMessage('Parsing CSV...');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data.filter((row: any) => row['LATITUDE'] && row['NEXT OPEN HOUSE START TIME']);
          setStatusMessage(`Uploading ${rows.length} listings...`);
          const res = await fetch(`/api/sessions/${sessionId}/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows, timezone }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          setStatusMessage(`Imported ${data.count} open houses`);
          setActiveTab('houses');
          mutate();
        } catch (err: any) {
          setStatusMessage(`Upload error: ${err.message}`);
        } finally {
          setUploading(false);
        }
      },
      error: (err) => {
        setStatusMessage(`Parse error: ${err.message}`);
        setUploading(false);
      },
    });
  }

  async function handleGeocode() {
    if (!startAddress.trim()) return;
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(startAddress)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'OpenHouseRouter/1.0' } }
      );
      const results = await res.json();
      if (results.length === 0) {
        setStatusMessage('Address not found. Try clicking on the map instead.');
        return;
      }
      const { lat, lon } = results[0];
      await updateMemberLocation(parseFloat(lat), parseFloat(lon), startAddress);
      setStatusMessage('Starting location set');
    } catch (e: any) {
      setStatusMessage(`Geocode error: ${e.message}`);
    } finally {
      setGeocoding(false);
    }
  }

  async function updateMemberLocation(lat: number, lng: number, address?: string) {
    if (!memberId) return;
    const updates: any = { member_id: memberId, start_lat: lat, start_lng: lng };
    if (address) updates.start_address = address;
    await fetch(`/api/sessions/${sessionId}/members`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    mutate();
  }

  async function handleUpdateSettings() {
    if (!memberId) return;
    await fetch(`/api/sessions/${sessionId}/members`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, time_per_stop: timePerStop }),
    });
    mutate();
  }

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (!settingLocation || !memberId) return;
      updateMemberLocation(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      setStartAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      setSettingLocation(false);
      setStatusMessage('Starting location set from map');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settingLocation, memberId]
  );

  async function togglePref(houseId: number, newStatus: HousePrefStatus) {
    if (!memberId) return;
    const current = housePrefs.get(houseId) || 'default';
    const status = current === newStatus ? 'default' : newStatus;
    await fetch(`/api/sessions/${sessionId}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, house_id: houseId, status }),
    });
    mutate();
  }

  async function handleExcludeFromRoute(houseId: number) {
    if (!memberId) return;
    await fetch(`/api/sessions/${sessionId}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, house_id: houseId, status: 'excluded' }),
    });
    mutate();
    setStatusMessage('House excluded. Re-generate your route to update.');
  }

  async function handleOptimize() {
    if (!memberId || !selectedDay) return;
    if (!currentMember?.start_lat || !currentMember?.start_lng) {
      setStatusMessage('Please set your starting location first');
      return;
    }
    await requireAd();

    setOptimizing(true);
    setStatusMessage('Optimizing route...');

    const [year, month, day] = selectedDay.split('-').map(Number);
    const [startH, startM] = dayStartHour.split(':').map(Number);
    const [endH, endM] = dayEndHour.split(':').map(Number);

    const dayStart = new Date(year, month - 1, day, startH, startM);
    const dayEnd = new Date(year, month - 1, day, endH, endM);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: memberId,
          day_date: selectedDay,
          day_start_time: dayStart.toISOString(),
          day_end_time: dayEnd.toISOString(),
        }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setStatusMessage(`Route optimized: ${result.optimized} stops`);
      setActiveTab('plan');
      mutate();
    } catch (e: any) {
      setStatusMessage(`Optimization error: ${e.message}`);
    } finally {
      setOptimizing(false);
    }
  }

  async function handleDeleteRoute(routeId: number) {
    await requireAd();
    try {
      await fetch(`/api/sessions/${sessionId}/routes/${routeId}`, { method: 'DELETE' });
      mutate();
      setStatusMessage('Route deleted');
    } catch (e: any) {
      setStatusMessage(`Error: ${e.message}`);
    }
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(sessionId);
    setStatusMessage('Session code copied!');
  }

  // Auto-clear status messages
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(''), 4000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Session Not Found</h1>
          <p className="text-gray-500">Check your session code and try again.</p>
          <a href="/" className="mt-4 inline-block text-indigo-600 hover:underline">Go Home</a>
        </div>
      </div>
    );
  }

  if (showJoin || !memberId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Join Session</h2>
          <p className="text-gray-500 text-sm mb-6">
            Session: <span className="font-mono font-medium text-gray-700">{sessionId}</span>
          </p>
          <input
            type="text"
            placeholder="Your name"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none mb-4"
            autoFocus
          />
          <button
            onClick={handleJoin}
            disabled={!memberName.trim()}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium rounded-xl transition"
          >
            Join Session
          </button>
        </div>
      </div>
    );
  }

  const startLocation =
    currentMember?.start_lat && currentMember?.start_lng
      ? { lat: currentMember.start_lat, lng: currentMember.start_lng }
      : null;

  function getRouteStopNumber(houseId: number): number | null {
    const stop = currentDayRoute?.stops.find((s) => s.house_id === houseId);
    return stop ? stop.stop_order : null;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <a href="/" className="text-indigo-600 hover:text-indigo-800">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
              <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" />
            </svg>
          </a>
          <div>
            <h1 className="font-semibold text-gray-900 text-sm leading-tight">
              {data?.session?.name || 'Loading...'}
            </h1>
            <button onClick={handleCopyCode} className="text-xs text-gray-400 hover:text-indigo-600 font-mono transition" title="Click to copy">
              Code: {sessionId}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data?.members?.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: `${m.color}15`,
                color: m.color,
                border: m.id === memberId ? `2px solid ${m.color}` : '2px solid transparent',
              }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: m.color }} />
              {m.name}
              {m.id === memberId && <span className="text-[10px] opacity-60">(you)</span>}
            </div>
          ))}
        </div>
      </header>

      {/* Status toast */}
      {statusMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50">
          {statusMessage}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[420px] border-r border-gray-200 bg-white flex flex-col overflow-hidden flex-shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 flex-shrink-0">
            <button
              onClick={() => setActiveTab('plan')}
              className={`flex-1 py-2.5 text-sm font-medium transition relative ${
                activeTab === 'plan'
                  ? 'text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Plan & Route
              {currentDayRoute && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full">
                  {currentDayRoute.stops.length}
                </span>
              )}
              {activeTab === 'plan' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
            </button>
            <button
              onClick={() => setActiveTab('houses')}
              className={`flex-1 py-2.5 text-sm font-medium transition relative ${
                activeTab === 'houses'
                  ? 'text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Houses
              {dayHouses.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center px-1.5 h-5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-full">
                  {dayHouses.length}
                </span>
              )}
              {favoritedCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center px-1.5 h-5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">
                  ★{favoritedCount}
                </span>
              )}
              {activeTab === 'houses' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {activeTab === 'plan' ? (
              <PlanTab />
            ) : (
              <HousesTab />
            )}
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          {data?.houses ? (
            <MapView
              houses={data.houses}
              routes={data.routes || []}
              members={data.members || []}
              currentMemberId={memberId}
              selectedDay={selectedDay}
              claimedHouseIds={claimedHouseIds}
              housePrefs={housePrefs}
              onMapClick={handleMapClick}
              startLocation={startLocation}
              highlightHouseId={highlightHouseId}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <p className="text-gray-400">Loading map...</p>
            </div>
          )}

          {settingLocation && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-sm px-4 py-2 rounded-full shadow-lg z-10">
              Click anywhere on the map to set your starting location
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs space-y-1.5 z-10">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow" />
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-amber-300 shadow" />
              <span>Favorited</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-300 border-2 border-white shadow opacity-50" />
              <span>Claimed / excluded</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-slate-800 border-2 border-white shadow" />
              <span>Your start</span>
            </div>
            {data?.members?.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-white shadow" style={{ background: m.color }} />
                <span>{m.name}&apos;s route</span>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );

  // ─── Plan & Route Tab ──────────────────────────────────────────────
  function PlanTab() {
    return (
      <div className="p-4 space-y-5">
        {/* CSV Upload */}
        {(!data?.houses || data.houses.length === 0) ? (
          <section className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto text-gray-300 mb-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-gray-500 mb-3">Upload your Redfin CSV to get started</p>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition"
            >
              {uploading ? 'Uploading...' : 'Choose CSV File'}
            </button>
          </section>
        ) : (
          <section className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{data.houses.length}</span> open houses loaded
            </div>
            <div>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                Re-upload
              </button>
            </div>
          </section>
        )}

        {/* Day Selector */}
        {data?.available_days && data.available_days.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select Day</h3>
            <div className="flex flex-wrap gap-2">
              {data.available_days.map((day) => {
                const count = data.houses?.filter((h) => h.day_key === day).length ?? 0;
                const hasRoute = currentMemberRoutes.some((r) => r.day_date === day);
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`relative px-3 py-2 rounded-lg text-sm font-medium transition border ${
                      selectedDay === day
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    {formatDayKey(day)}
                    <span className={`block text-[10px] ${selectedDay === day ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {count} homes
                    </span>
                    {hasRoute && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Starting Location */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Starting Location</h3>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter address..."
                value={startAddress}
                onChange={(e) => setStartAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
              <button onClick={handleGeocode} disabled={geocoding || !startAddress.trim()} className="px-3 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm rounded-lg transition">
                {geocoding ? '...' : 'Set'}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSettingLocation(!settingLocation);
                  setStatusMessage(settingLocation ? '' : 'Click on the map to set your starting location');
                }}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                  settingLocation ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {settingLocation ? 'Click map now...' : 'Pick on map'}
              </button>
              <button
                onClick={() => {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      updateMemberLocation(pos.coords.latitude, pos.coords.longitude, 'Current location');
                      setStartAddress('Current location');
                      setStatusMessage('Using your current location');
                    },
                    () => setStatusMessage('Could not get location')
                  );
                }}
                className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 transition"
              >
                Use my location
              </button>
            </div>
            {startLocation && (
              <p className="text-xs text-green-600">
                Location set: {currentMember?.start_address || `${startLocation.lat.toFixed(4)}, ${startLocation.lng.toFixed(4)}`}
              </p>
            )}
          </div>
        </section>

        {/* Time Settings */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Schedule</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Start time</label>
              <input type="time" value={dayStartHour} onChange={(e) => setDayStartHour(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">End time</label>
              <input type="time" value={dayEndHour} onChange={(e) => setDayEndHour(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1 block">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
            >
              {[
                'America/New_York', 'America/Chicago', 'America/Denver',
                'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage',
                'Pacific/Honolulu',
              ].map((tz) => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1 block">
              Time per stop: <span className="font-semibold text-gray-700">{timePerStop} min</span>
            </label>
            <input type="range" min={2} max={30} value={timePerStop} onChange={(e) => setTimePerStop(parseInt(e.target.value))} onMouseUp={handleUpdateSettings} onTouchEnd={handleUpdateSettings} className="w-full accent-indigo-600" />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>2 min</span>
              <span>30 min</span>
            </div>
          </div>
        </section>

        {/* Optimize Button */}
        {selectedDay && (
          <button
            onClick={handleOptimize}
            disabled={optimizing || !startLocation}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold rounded-xl transition shadow-sm shadow-indigo-200 flex items-center justify-center gap-2"
          >
            {optimizing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Optimizing...
              </>
            ) : (
              <>Generate Route for {formatDayKey(selectedDay)}</>
            )}
          </button>
        )}

        {/* Preference summary */}
        {(favoritedCount > 0 || excludedCount > 0) && (
          <div className="flex gap-3 text-xs">
            {favoritedCount > 0 && (
              <span className="text-amber-600">★ {favoritedCount} favorited</span>
            )}
            {excludedCount > 0 && (
              <span className="text-gray-400">{excludedCount} excluded</span>
            )}
          </div>
        )}

        {/* Current Route Itinerary */}
        {currentDayRoute && currentDayRoute.stops.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Your Route — {currentDayRoute.stops.length} stops
              </h3>
              <button onClick={() => handleDeleteRoute(currentDayRoute.id)} className="text-xs text-red-500 hover:text-red-700">
                Clear route
              </button>
            </div>

            <div className="space-y-0">
              {currentDayRoute.stops.map((stop) => {
                const arrival = new Date(stop.arrival_time);
                const departure = new Date(stop.departure_time);
                const pref = housePrefs.get(stop.house_id) || 'default';
                return (
                  <div key={stop.id} className="relative pl-8 pb-3">
                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-indigo-200" />
                    <div
                      className="absolute left-1 top-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: currentMember?.color || '#4f46e5' }}
                    >
                      {stop.stop_order}
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 group">
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{stop.house.address}</p>
                          <p className="text-xs text-gray-500">{stop.house.city} — ${stop.house.price?.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {pref === 'favorited' && <span className="text-amber-500 text-xs">★</span>}
                          {stop.house.url && (
                            <a href={stop.house.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-600">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                                <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                              </svg>
                            </a>
                          )}
                          <button
                            onClick={() => handleExcludeFromRoute(stop.house_id)}
                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove from route"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span className="text-indigo-600 font-medium">
                          {arrival.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {' → '}
                          {departure.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        {stop.travel_time_minutes > 0 && (
                          <span className="text-gray-400">{Math.round(stop.travel_time_minutes)} min drive</span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        Open house: {new Date(stop.house.open_house_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {' – '}
                        {new Date(stop.house.open_house_end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-indigo-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between text-indigo-900">
                <span>Total drive time</span>
                <span className="font-semibold">
                  {Math.round(currentDayRoute.stops.reduce((sum, s) => sum + s.travel_time_minutes, 0))} min
                </span>
              </div>
              <div className="flex justify-between text-indigo-700 text-xs mt-1">
                <span>Houses visited</span>
                <span>{currentDayRoute.stops.length}</span>
              </div>
            </div>
          </section>
        )}

        {/* Team Routes Summary */}
        {data?.routes && data.routes.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">All Team Routes</h3>
            <div className="space-y-2">
              {data.routes.map((route) => {
                const member = data.members?.find((m) => m.id === route.member_id);
                if (!member) return null;
                return (
                  <div
                    key={route.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100"
                    style={{ borderLeftColor: member.color, borderLeftWidth: 3 }}
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900">{member.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{formatDayKey(route.day_date)}</span>
                    </div>
                    <span className="text-xs font-medium text-gray-500">{route.stops.length} stops</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ─── Houses Tab ────────────────────────────────────────────────────
  function HousesTab() {
    if (!data?.houses || data.houses.length === 0) {
      return (
        <div className="p-4">
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
            <p className="text-sm text-gray-500 mb-3">Upload a Redfin CSV first to see houses</p>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
              {uploading ? 'Uploading...' : 'Choose CSV File'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        {/* Search & filters */}
        <div className="p-3 border-b border-gray-100 space-y-2 flex-shrink-0">
          <input
            type="text"
            placeholder="Search address, city, zip..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(['time', 'price-asc', 'price-desc', 'address'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition ${
                    sortBy === s ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {s === 'time' ? 'Time' : s === 'price-asc' ? 'Price ↑' : s === 'price-desc' ? 'Price ↓' : 'A–Z'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showExcluded}
                onChange={(e) => setShowExcluded(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
              />
              Show excluded
            </label>
          </div>
          <div className="text-[10px] text-gray-400">
            {filteredHouses.length} of {dayHouses.length} houses
            {favoritedCount > 0 && <span className="text-amber-600 ml-1">· ★{favoritedCount} favorited</span>}
            {excludedCount > 0 && <span className="ml-1">· {excludedCount} excluded</span>}
          </div>
        </div>

        {/* House list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredHouses.map((house) => (
            <HouseCard key={house.id} house={house} />
          ))}
          {filteredHouses.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">
              No houses match your filters
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── House Card ────────────────────────────────────────────────────
  function HouseCard({ house }: { house: House }) {
    const pref = housePrefs.get(house.id) || 'default';
    const isFavorited = pref === 'favorited';
    const isExcluded = pref === 'excluded';
    const isClaimed = claimedHouseIds.has(house.id);
    const stopNum = getRouteStopNumber(house.id);

    const startTime = new Date(house.open_house_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = new Date(house.open_house_end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const priceStr = house.price ? `$${(house.price / 1000).toFixed(0)}K` : '—';

    return (
      <div
        className={`border-b border-gray-50 px-3 py-2.5 hover:bg-gray-50 transition group ${
          isExcluded ? 'opacity-40' : ''
        }`}
        onMouseEnter={() => setHighlightHouseId(house.id)}
        onMouseLeave={() => setHighlightHouseId(null)}
        style={isFavorited ? { borderLeft: '3px solid #f59e0b' } : stopNum ? { borderLeft: `3px solid ${currentMember?.color || '#4f46e5'}` } : {}}
      >
        <div className="flex items-start gap-2">
          {/* Favorite button */}
          <button
            onClick={() => togglePref(house.id, 'favorited')}
            className={`mt-0.5 flex-shrink-0 transition ${
              isFavorited ? 'text-amber-500' : 'text-gray-200 hover:text-amber-400'
            }`}
            title={isFavorited ? 'Remove favorite' : 'Add as favorite (prioritized in route)'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
            </svg>
          </button>

          {/* House info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className={`text-sm font-medium truncate ${isExcluded ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                {house.address}
              </p>
              {stopNum && (
                <span
                  className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white"
                  style={{ background: currentMember?.color || '#4f46e5' }}
                >
                  {stopNum}
                </span>
              )}
              {isClaimed && !stopNum && (
                <span className="flex-shrink-0 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">claimed</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <span>{house.city}</span>
              <span className="font-semibold text-gray-700">{priceStr}</span>
              <span>{house.beds}/{house.baths}ba</span>
              {house.square_feet && <span>{house.square_feet.toLocaleString()}sf</span>}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {startTime} – {endTime}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {house.url && (
              <a href={house.url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-indigo-500 transition" title="View on Redfin">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                </svg>
              </a>
            )}
            <button
              onClick={() => togglePref(house.id, 'excluded')}
              className={`transition ${
                isExcluded ? 'text-red-400 hover:text-gray-400' : 'text-gray-200 hover:text-red-400'
              }`}
              title={isExcluded ? 'Include back' : 'Exclude from route'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
