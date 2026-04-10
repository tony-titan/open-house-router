'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { House, RouteWithStops, Member, HousePrefStatus } from '@/types';

interface MapViewProps {
  houses: House[];
  routes: RouteWithStops[];
  members: Member[];
  currentMemberId: string | null;
  selectedDay: string | null;
  claimedHouseIds: Set<number>;
  housePrefs: Map<number, HousePrefStatus>;
  onMapClick?: (lat: number, lng: number) => void;
  startLocation?: { lat: number; lng: number } | null;
  highlightHouseId?: number | null;
}

export default function MapView({
  houses,
  routes,
  members,
  currentMemberId,
  selectedDay,
  claimedHouseIds,
  housePrefs,
  onMapClick,
  startLocation,
  highlightHouseId,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeLayersRef = useRef<L.LayerGroup | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [47.2, -122.3],
      zoom: 11,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    routeLayersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.off('click');
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });
  }, [onMapClick]);

  const dayHouses = useMemo(() => {
    if (!selectedDay) return houses;
    return houses.filter((h) => h.day_key === selectedDay);
  }, [houses, selectedDay]);

  const dayRoutes = useMemo(() => {
    if (!selectedDay) return routes;
    return routes.filter((r) => r.day_date === selectedDay);
  }, [routes, selectedDay]);

  const memberMap = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((mem) => m.set(mem.id, mem));
    return m;
  }, [members]);

  const routeHouseIds = useMemo(() => {
    const ids = new Set<number>();
    dayRoutes.forEach((r) => {
      r.stops.forEach((s) => ids.add(s.house_id));
    });
    return ids;
  }, [dayRoutes]);

  const getHouseRouteInfo = useCallback(
    (houseId: number) => {
      for (const r of dayRoutes) {
        const stop = r.stops.find((s) => s.house_id === houseId);
        if (stop) {
          const member = memberMap.get(r.member_id);
          return { route: r, stop, member };
        }
      }
      return null;
    },
    [dayRoutes, memberMap]
  );

  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();

    dayHouses.forEach((house) => {
      const routeInfo = getHouseRouteInfo(house.id);
      const isClaimed = claimedHouseIds.has(house.id) && !routeInfo;
      const pref = housePrefs.get(house.id) || 'default';
      const isHighlighted = highlightHouseId === house.id;

      if (pref === 'excluded' && !routeInfo) return;

      let bgColor = '#3b82f6';
      let size = 22;
      let label = '';
      let opacity = 1;
      let borderColor = 'white';
      let borderWidth = 2;

      if (routeInfo) {
        bgColor = routeInfo.member?.color || '#6b7280';
        size = 28;
        label = `${routeInfo.stop.stop_order}`;
      } else if (isClaimed) {
        bgColor = '#d1d5db';
        size = 18;
        opacity = 0.4;
      } else if (pref === 'favorited') {
        bgColor = '#f59e0b';
        size = 26;
        label = '★';
        borderColor = '#fbbf24';
        borderWidth = 3;
      } else {
        bgColor = '#3b82f6';
        size = 22;
      }

      if (isHighlighted) {
        size += 6;
        borderColor = '#1e293b';
        borderWidth = 3;
      }

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${bgColor};
          border: ${borderWidth}px solid ${borderColor};
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: ${label ? '11px' : '0'};
          font-weight: 700;
          opacity: ${opacity};
          cursor: pointer;
          transition: transform 0.15s;
          ${isHighlighted ? 'animation: pulse-ring 1.5s ease-in-out infinite;' : ''}
        " onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">${label}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const priceStr = house.price ? `$${house.price.toLocaleString()}` : 'N/A';
      const startTime = new Date(house.open_house_start).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      const endTime = new Date(house.open_house_end).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });

      let popupHtml = `
        <div style="min-width: 220px; font-family: system-ui, sans-serif;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${house.address}</div>
          <div style="color: #6b7280; font-size: 12px; margin-bottom: 8px;">${house.city}, ${house.state} ${house.zip}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px; margin-bottom: 8px;">
            <div><strong>${priceStr}</strong></div>
            <div>${house.beds}bd / ${house.baths}ba</div>
            <div>${house.square_feet ? house.square_feet.toLocaleString() + ' sqft' : ''}</div>
            <div>${house.property_type}</div>
          </div>
          <div style="background: #f1f5f9; padding: 6px 8px; border-radius: 6px; font-size: 12px; margin-bottom: 6px;">
            Open: ${startTime} - ${endTime}
          </div>`;

      if (pref === 'favorited') {
        popupHtml += `<div style="color: #d97706; font-size: 12px; font-weight: 600; margin-bottom: 4px;">★ Favorited</div>`;
      }

      if (routeInfo) {
        const arrivalTime = new Date(routeInfo.stop.arrival_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        popupHtml += `
          <div style="background: ${routeInfo.member?.color}15; border-left: 3px solid ${routeInfo.member?.color}; padding: 4px 8px; border-radius: 0 6px 6px 0; font-size: 12px;">
            Stop #${routeInfo.stop.stop_order} — ${routeInfo.member?.name} — Arrive ${arrivalTime}
          </div>`;
      } else if (isClaimed) {
        popupHtml += `<div style="color: #9ca3af; font-size: 12px;">Claimed by teammate</div>`;
      }

      if (house.url) {
        popupHtml += `<a href="${house.url}" target="_blank" rel="noopener" style="display: block; margin-top: 6px; color: #4f46e5; font-size: 12px; text-decoration: none;">View on Redfin →</a>`;
      }

      popupHtml += '</div>';

      const marker = L.marker([house.latitude, house.longitude], { icon }).bindPopup(popupHtml);
      markersRef.current!.addLayer(marker);
    });
  }, [dayHouses, claimedHouseIds, routeHouseIds, getHouseRouteInfo, housePrefs, highlightHouseId]);

  useEffect(() => {
    if (!routeLayersRef.current) return;
    routeLayersRef.current.clearLayers();

    dayRoutes.forEach((route) => {
      const member = memberMap.get(route.member_id);
      const color = member?.color || '#6b7280';
      const isCurrentMember = route.member_id === currentMemberId;

      if (route.route_geometry && route.route_geometry.length > 0) {
        route.route_geometry.forEach((segment: [number, number][]) => {
          const polyline = L.polyline(segment, {
            color,
            weight: isCurrentMember ? 4 : 3,
            opacity: isCurrentMember ? 0.8 : 0.5,
            dashArray: isCurrentMember ? undefined : '8, 8',
          });
          routeLayersRef.current!.addLayer(polyline);
        });
      } else if (route.stops.length > 0) {
        const coords: [number, number][] = [];
        if (member?.start_lat && member?.start_lng) {
          coords.push([member.start_lat, member.start_lng]);
        }
        route.stops.forEach((stop) => {
          coords.push([stop.house.latitude, stop.house.longitude]);
        });

        if (coords.length > 1) {
          const polyline = L.polyline(coords, {
            color,
            weight: isCurrentMember ? 4 : 3,
            opacity: isCurrentMember ? 0.8 : 0.5,
            dashArray: isCurrentMember ? undefined : '8, 8',
          });
          routeLayersRef.current!.addLayer(polyline);
        }
      }
    });
  }, [dayRoutes, memberMap, currentMemberId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }

    if (startLocation) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #1e293b;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 16px;
        ">★</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      startMarkerRef.current = L.marker([startLocation.lat, startLocation.lng], { icon })
        .bindPopup('<strong>Your starting location</strong>')
        .addTo(map);
    }
  }, [startLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || dayHouses.length === 0) return;

    const bounds = L.latLngBounds(dayHouses.map((h) => [h.latitude, h.longitude]));
    if (startLocation) {
      bounds.extend([startLocation.lat, startLocation.lng]);
    }
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [dayHouses, startLocation]);

  return <div ref={containerRef} className="w-full h-full" />;
}
