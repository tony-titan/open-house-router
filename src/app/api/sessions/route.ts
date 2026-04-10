import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createSession } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    const id = nanoid(8);
    const session = createSession(id, name || 'Open House Weekend');
    return NextResponse.json(session);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
