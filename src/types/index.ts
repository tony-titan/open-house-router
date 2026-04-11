export interface House {
  id: number;
  session_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  property_type: string;
  square_feet: number | null;
  lot_size: number | null;
  year_built: number | null;
  open_house_start: string;
  open_house_end: string;
  url: string;
  latitude: number;
  longitude: number;
  day_key: string;
}

export interface Member {
  id: string;
  session_id: string;
  name: string;
  color: string;
  start_lat: number | null;
  start_lng: number | null;
  start_address: string;
  time_per_stop: number;
  created_at: string;
}

export interface Session {
  id: string;
  name: string;
  created_at: string;
}

export interface RouteRecord {
  id: number;
  member_id: string;
  session_id: string;
  day_date: string;
  day_start_time: string;
  day_end_time: string;
  created_at: string;
}

export interface RouteStop {
  id: number;
  route_id: number;
  house_id: number;
  stop_order: number;
  arrival_time: string;
  departure_time: string;
  travel_time_minutes: number;
}

export interface RouteWithStops extends RouteRecord {
  stops: (RouteStop & { house: House })[];
  route_geometry?: [number, number][][];
  member?: Member;
}

export interface OptimizeRequest {
  member_id: string;
  day_date: string;
  day_start_time: string;
  day_end_time: string;
}

export type HousePrefStatus = 'default' | 'favorited' | 'excluded';

export interface HousePref {
  member_id: string;
  house_id: number;
  status: HousePrefStatus;
}

export interface SessionData {
  session: Session;
  houses: House[];
  members: Member[];
  routes: RouteWithStops[];
  available_days: string[];
  preferences: Record<string, HousePref[]>; // keyed by member_id
}

export const MEMBER_COLORS = [
  '#4f46e5', // indigo
  '#dc2626', // red
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#c026d3', // fuchsia
  '#65a30d', // lime
];

export function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${day}`;
}

const MONTH_MAP: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3,
  May: 4, June: 5, July: 6, August: 7,
  September: 8, October: 9, November: 10, December: 11,
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getCachedDTF(tz: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    dtfCache.set(tz, dtf);
  }
  return dtf;
}

export function parseRedfinDate(dateStr: string, timezone?: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const parts = dateStr.trim().split(' ');
  if (parts.length < 3) return null;

  const [datePart, timePart, ampm] = parts;
  const datePieces = datePart.split('-');
  if (datePieces.length < 3) return null;

  const [monthStr, dayStr, yearStr] = datePieces;
  const [hourStr, minStr] = timePart.split(':');

  const month = MONTH_MAP[monthStr];
  if (month === undefined) return null;

  let hours = parseInt(hourStr, 10);
  const minutes = parseInt(minStr, 10);

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  const year = parseInt(yearStr, 10);
  const day = parseInt(dayStr, 10);

  if (!timezone) {
    return new Date(year, month, day, hours, minutes);
  }

  const naive = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  const asUtc = new Date(naive + 'Z');
  const dtf = getCachedDTF(timezone);
  const tzParts = dtf.formatToParts(asUtc);
  const p: Record<string, string> = {};
  for (const part of tzParts) p[part.type] = part.value;
  const h = p.hour === '24' ? '00' : p.hour;
  const localRendered = new Date(`${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}Z`);
  const offsetMs = localRendered.getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offsetMs);
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
