import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  getMember,
  getHousesByDay,
  getClaimedHouseIds,
  getMemberExcludedIds,
  getMemberFavoritedIds,
  createRoute,
  insertRouteStops,
  updateRouteGeometry,
  getRoutes,
} from '@/lib/db';
import { optimizeRoute } from '@/lib/optimizer';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const session = getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { member_id, day_date, day_start_time, day_end_time } = await request.json();

    const member = getMember(member_id);
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (!member.start_lat || !member.start_lng) {
      return NextResponse.json({ error: 'Please set your starting location first' }, { status: 400 });
    }

    const houses = getHousesByDay(id, day_date);
    if (houses.length === 0) {
      return NextResponse.json({ error: 'No open houses found for this day' }, { status: 400 });
    }

    const claimedIds = getClaimedHouseIds(id, member_id);
    const excludedIds = getMemberExcludedIds(member_id);
    const favoritedIds = getMemberFavoritedIds(member_id);

    const dayStart = new Date(day_start_time);
    const dayEnd = new Date(day_end_time);
    const dayOfWeek = dayStart.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    console.log(`[optimize] Day ${day_date} (${isWeekend ? 'weekend' : 'weekday'}): ${houses.length} houses, window ${dayStart.toISOString()} – ${dayEnd.toISOString()}, stop=${member.time_per_stop || 5}min`);

    const result = await optimizeRoute({
      houses,
      startLat: member.start_lat,
      startLng: member.start_lng,
      dayStartTime: dayStart,
      dayEndTime: dayEnd,
      timePerStopMinutes: member.time_per_stop || 5,
      excludeHouseIds: excludedIds,
      claimedHouseIds: claimedIds,
      favoritedHouseIds: favoritedIds,
      isWeekend,
    });

    for (const stop of result.stops) {
      const ohStart = new Date(stop.house.open_house_start);
      const ohEnd = new Date(stop.house.open_house_end);
      const ok = stop.arrival_time >= ohStart && stop.departure_time <= ohEnd;
      console.log(`[optimize]  #${result.stops.indexOf(stop) + 1} ${stop.house.address}: arrive ${stop.arrival_time.toISOString()} depart ${stop.departure_time.toISOString()} | OH ${ohStart.toISOString()}–${ohEnd.toISOString()} | ${ok ? 'OK' : 'VIOLATION'}`);
    }

    const routeId = createRoute(member_id, id, day_date, day_start_time, day_end_time);

    const stopRecords = result.stops.map((stop, index) => ({
      house_id: stop.house.id,
      stop_order: index + 1,
      arrival_time: stop.arrival_time.toISOString(),
      departure_time: stop.departure_time.toISOString(),
      travel_time_minutes: stop.travel_time_minutes,
    }));

    insertRouteStops(routeId, stopRecords);

    if (result.routeGeometry) {
      updateRouteGeometry(routeId, JSON.stringify(result.routeGeometry));
    }

    const routes = getRoutes(id);
    return NextResponse.json({ routes, optimized: result.totalHouses });
  } catch (error: any) {
    console.error('Optimization error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
