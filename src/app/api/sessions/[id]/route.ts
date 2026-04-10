import { NextRequest, NextResponse } from 'next/server';
import { getSession, getHouses, getMembers, getRoutes, getAvailableDays, getAllPreferences } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const session = getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const houses = getHouses(id);
    const members = getMembers(id);
    const routes = getRoutes(id);
    const available_days = getAvailableDays(id);
    const preferences = getAllPreferences(id);

    return NextResponse.json({ session, houses, members, routes, available_days, preferences });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
