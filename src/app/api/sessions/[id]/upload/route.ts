import { NextRequest, NextResponse } from 'next/server';
import { getSession, insertHouses, getHouses, getAvailableDays } from '@/lib/db';
import { parseRedfinDate, getDayKey } from '@/types';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const session = getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { rows, timezone } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    const tz = timezone || undefined;

    const MAX_OPEN_HOUSE_HOURS = 8;
    const MIN_OPEN_HOUSE_HOUR = 6; // 6 AM — no real open house starts before this

    const houses = rows
      .filter((row: any) => {
        const lat = parseFloat(row['LATITUDE']);
        const lng = parseFloat(row['LONGITUDE']);
        const start = row['NEXT OPEN HOUSE START TIME'];
        const end = row['NEXT OPEN HOUSE END TIME'];
        return !isNaN(lat) && !isNaN(lng) && start && end;
      })
      .map((row: any) => {
        const startDate = parseRedfinDate(row['NEXT OPEN HOUSE START TIME'], tz);
        const endDate = parseRedfinDate(row['NEXT OPEN HOUSE END TIME'], tz);
        if (!startDate || !endDate) return null;

        const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
        if (durationHours > MAX_OPEN_HOUSE_HOURS || durationHours <= 0) return null;

        const startHourUTC = startDate.getUTCHours();
        const tzOffsetHours = tz ? getTimezoneOffsetHours(startDate, tz) : 0;
        const localStartHour = (startHourUTC + tzOffsetHours + 24) % 24;
        if (localStartHour < MIN_OPEN_HOUSE_HOUR) return null;

        return {
          address: row['ADDRESS'] || '',
          city: row['CITY'] || '',
          state: row['STATE OR PROVINCE'] || '',
          zip: row['ZIP OR POSTAL CODE'] || '',
          price: parseFloat(row['PRICE']) || 0,
          beds: parseInt(row['BEDS']) || 0,
          baths: parseFloat(row['BATHS']) || 0,
          property_type: row['PROPERTY TYPE'] || '',
          square_feet: parseInt(row['SQUARE FEET']) || null,
          lot_size: parseInt(row['LOT SIZE']) || null,
          year_built: parseInt(row['YEAR BUILT']) || null,
          open_house_start: startDate.toISOString(),
          open_house_end: endDate.toISOString(),
          url: row['URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)'] || '',
          latitude: parseFloat(row['LATITUDE']),
          longitude: parseFloat(row['LONGITUDE']),
          day_key: getDayKey(startDate),
        };
      })
      .filter(Boolean);

    insertHouses(id, houses);

    return NextResponse.json({
      count: houses.length,
      houses: getHouses(id),
      available_days: getAvailableDays(id),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getTimezoneOffsetHours(date: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    const h = p.hour === '24' ? '00' : p.hour;
    const localStr = `${p.year}-${p.month}-${p.day}T${h}:${p.minute}:00Z`;
    const localAsUtc = new Date(localStr);
    return (localAsUtc.getTime() - date.getTime()) / (1000 * 60 * 60);
  } catch {
    return 0;
  }
}
