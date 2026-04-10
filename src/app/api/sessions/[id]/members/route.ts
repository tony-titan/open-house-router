import { NextRequest, NextResponse } from 'next/server';
import { getSession, getMembers, createMember, updateMember, deleteMember } from '@/lib/db';
import { nanoid } from 'nanoid';
import { MEMBER_COLORS } from '@/types';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const members = getMembers(id);
    return NextResponse.json(members);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const session = getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { name } = await request.json();
    const members = getMembers(id);
    const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
    const memberId = nanoid(10);

    const member = createMember(memberId, id, name, color);
    return NextResponse.json(member);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { member_id, ...updates } = body;

    if (!member_id) {
      return NextResponse.json({ error: 'member_id required' }, { status: 400 });
    }

    const allowedFields = ['name', 'start_lat', 'start_lng', 'start_address', 'time_per_stop'];
    const safeUpdates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    }

    const member = updateMember(member_id, safeUpdates);
    return NextResponse.json(member);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { member_id } = await request.json();
    if (!member_id) {
      return NextResponse.json({ error: 'member_id required' }, { status: 400 });
    }
    deleteMember(member_id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
