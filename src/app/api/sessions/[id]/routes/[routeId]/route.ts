import { NextRequest, NextResponse } from 'next/server';
import { deleteRoute, getRoutes } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; routeId: string } }
) {
  try {
    const routeId = parseInt(params.routeId, 10);
    if (isNaN(routeId)) {
      return NextResponse.json({ error: 'Invalid route ID' }, { status: 400 });
    }

    deleteRoute(routeId);
    const routes = getRoutes(params.id);
    return NextResponse.json({ routes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
