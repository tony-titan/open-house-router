import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited, retryAfterSeconds } from '@/lib/rate-limit';

const MINUTE = 60_000;

const GLOBAL_LIMIT = 100;
const GLOBAL_WINDOW = MINUTE;

const API_WRITE_LIMIT = 20;
const API_WRITE_WINDOW = MINUTE;

const SESSION_CREATE_LIMIT = 5;
const SESSION_CREATE_WINDOW = MINUTE;

const OPTIMIZE_LIMIT = 10;
const OPTIMIZE_WINDOW = MINUTE;

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return '127.0.0.1';
}

function blocked(ip: string, tier: string, windowMs: number): NextResponse {
  const retry = retryAfterSeconds(`${ip}:${tier}`, windowMs);
  return new NextResponse(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retry),
        'X-RateLimit-Tier': tier,
      },
    },
  );
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

export function middleware(request: NextRequest) {
  const ip = getClientIP(request);
  const { pathname } = request.nextUrl;
  const method = request.method;

  // --- Global limit (all requests) ---
  if (isRateLimited(`${ip}:global`, GLOBAL_LIMIT, GLOBAL_WINDOW)) {
    return blocked(ip, 'global', GLOBAL_WINDOW);
  }

  // Only apply stricter tiers to API mutations
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (!WRITE_METHODS.has(method)) return NextResponse.next();

  // --- Session creation (most abusable) ---
  if (pathname === '/api/sessions' && method === 'POST') {
    if (isRateLimited(`${ip}:session-create`, SESSION_CREATE_LIMIT, SESSION_CREATE_WINDOW)) {
      return blocked(ip, 'session-create', SESSION_CREATE_WINDOW);
    }
  }

  // --- Optimize (calls external OSRM API) ---
  if (pathname.match(/^\/api\/sessions\/[^/]+\/optimize$/) && method === 'POST') {
    if (isRateLimited(`${ip}:optimize`, OPTIMIZE_LIMIT, OPTIMIZE_WINDOW)) {
      return blocked(ip, 'optimize', OPTIMIZE_WINDOW);
    }
  }

  // --- General API write limit ---
  if (isRateLimited(`${ip}:api-write`, API_WRITE_LIMIT, API_WRITE_WINDOW)) {
    return blocked(ip, 'api-write', API_WRITE_WINDOW);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and internals:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
};
