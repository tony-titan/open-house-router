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

    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    const houses = rows
      .filter((row: any) => {
        const lat = parseFloat(row['LATITUDE']);
        const lng = parseFloat(row['LONGITUDE']);
        const start = row['NEXT OPEN HOUSE START TIME'];
        const end = row['NEXT OPEN HOUSE END TIME'];
        return !isNaN(lat) && !isNaN(lng) && start && end;
      })
      .map((row: any) => {
        const startDate = parseRedfinDate(row['NEXT OPEN HOUSE START TIME']);
        const endDate = parseRedfinDate(row['NEXT OPEN HOUSE END TIME']);
        if (!startDate || !endDate) return null;

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
