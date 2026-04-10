import { NextRequest, NextResponse } from 'next/server';
import { getSession, getPreferences, setPreference, setBulkPreferences } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const memberId = request.nextUrl.searchParams.get('member_id');
    if (!memberId) {
      return NextResponse.json({ error: 'member_id required' }, { status: 400 });
    }
    const prefs = getPreferences(memberId);
    return NextResponse.json(prefs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { member_id, house_id, house_ids, status } = await request.json();

    if (!member_id || !status) {
      return NextResponse.json({ error: 'member_id and status required' }, { status: 400 });
    }

    if (house_ids && Array.isArray(house_ids)) {
      setBulkPreferences(member_id, house_ids, status);
    } else if (house_id !== undefined) {
      setPreference(member_id, house_id, status);
    } else {
      return NextResponse.json({ error: 'house_id or house_ids required' }, { status: 400 });
    }

    const prefs = getPreferences(member_id);
    return NextResponse.json(prefs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
