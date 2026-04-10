import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'open-house.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS houses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip TEXT,
      price REAL,
      beds INTEGER,
      baths REAL,
      property_type TEXT,
      square_feet INTEGER,
      lot_size INTEGER,
      year_built INTEGER,
      open_house_start TEXT NOT NULL,
      open_house_end TEXT NOT NULL,
      url TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      day_key TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      start_lat REAL,
      start_lng REAL,
      start_address TEXT DEFAULT '',
      time_per_stop INTEGER DEFAULT 5,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      day_date TEXT NOT NULL,
      day_start_time TEXT,
      day_end_time TEXT,
      route_geometry TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS route_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL,
      house_id INTEGER NOT NULL,
      stop_order INTEGER NOT NULL,
      arrival_time TEXT,
      departure_time TEXT,
      travel_time_minutes REAL,
      FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
      FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS member_house_prefs (
      member_id TEXT NOT NULL,
      house_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'default',
      PRIMARY KEY (member_id, house_id),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_houses_session ON houses(session_id);
    CREATE INDEX IF NOT EXISTS idx_houses_day ON houses(session_id, day_key);
    CREATE INDEX IF NOT EXISTS idx_members_session ON members(session_id);
    CREATE INDEX IF NOT EXISTS idx_routes_session ON routes(session_id);
    CREATE INDEX IF NOT EXISTS idx_routes_member ON routes(member_id);
    CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id);
    CREATE INDEX IF NOT EXISTS idx_prefs_member ON member_house_prefs(member_id);
  `);
}

export function createSession(id: string, name: string) {
  const db = getDb();
  db.prepare('INSERT INTO sessions (id, name) VALUES (?, ?)').run(id, name);
  return getSession(id);
}

export function getSession(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
}

export function insertHouses(sessionId: string, houses: any[]) {
  const db = getDb();
  db.prepare('DELETE FROM houses WHERE session_id = ?').run(sessionId);

  const insert = db.prepare(`
    INSERT INTO houses (session_id, address, city, state, zip, price, beds, baths,
      property_type, square_feet, lot_size, year_built, open_house_start, open_house_end,
      url, latitude, longitude, day_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: any[]) => {
    for (const h of items) {
      insert.run(
        sessionId, h.address, h.city, h.state, h.zip, h.price, h.beds, h.baths,
        h.property_type, h.square_feet, h.lot_size, h.year_built,
        h.open_house_start, h.open_house_end, h.url, h.latitude, h.longitude, h.day_key
      );
    }
  });

  insertMany(houses);
}

export function getHouses(sessionId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM houses WHERE session_id = ?').all(sessionId) as any[];
}

export function getHousesByDay(sessionId: string, dayKey: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM houses WHERE session_id = ? AND day_key = ?').all(sessionId, dayKey) as any[];
}

export function getAvailableDays(sessionId: string): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT day_key FROM houses WHERE session_id = ? ORDER BY day_key').all(sessionId) as any[];
  return rows.map((r: any) => r.day_key);
}

export function createMember(id: string, sessionId: string, name: string, color: string) {
  const db = getDb();
  db.prepare('INSERT INTO members (id, session_id, name, color) VALUES (?, ?, ?, ?)').run(id, sessionId, name, color);
  return getMember(id);
}

export function getMember(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM members WHERE id = ?').get(id) as any;
}

export function getMembers(sessionId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM members WHERE session_id = ? ORDER BY created_at').all(sessionId) as any[];
}

export function updateMember(id: string, updates: Record<string, any>) {
  const db = getDb();
  const setClauses: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  db.prepare(`UPDATE members SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  return getMember(id);
}

export function deleteMember(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM route_stops WHERE route_id IN (SELECT id FROM routes WHERE member_id = ?)').run(id);
  db.prepare('DELETE FROM routes WHERE member_id = ?').run(id);
  db.prepare('DELETE FROM members WHERE id = ?').run(id);
}

export function createRoute(memberId: string, sessionId: string, dayDate: string, dayStartTime: string, dayEndTime: string) {
  const db = getDb();
  db.prepare('DELETE FROM route_stops WHERE route_id IN (SELECT id FROM routes WHERE member_id = ? AND day_date = ?)').run(memberId, dayDate);
  db.prepare('DELETE FROM routes WHERE member_id = ? AND day_date = ?').run(memberId, dayDate);

  const result = db.prepare(
    'INSERT INTO routes (member_id, session_id, day_date, day_start_time, day_end_time) VALUES (?, ?, ?, ?, ?)'
  ).run(memberId, sessionId, dayDate, dayStartTime, dayEndTime);

  return result.lastInsertRowid as number;
}

export function insertRouteStops(routeId: number, stops: any[]) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO route_stops (route_id, house_id, stop_order, arrival_time, departure_time, travel_time_minutes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: any[]) => {
    for (const s of items) {
      insert.run(routeId, s.house_id, s.stop_order, s.arrival_time, s.departure_time, s.travel_time_minutes);
    }
  });

  insertMany(stops);
}

export function updateRouteGeometry(routeId: number, geometry: string) {
  const db = getDb();
  db.prepare('UPDATE routes SET route_geometry = ? WHERE id = ?').run(geometry, routeId);
}

export function getRoutes(sessionId: string) {
  const db = getDb();
  const routes = db.prepare('SELECT * FROM routes WHERE session_id = ? ORDER BY day_date, created_at').all(sessionId) as any[];

  return routes.map((route: any) => {
    const stops = db.prepare(`
      SELECT rs.*, h.address, h.city, h.state, h.zip, h.price, h.beds, h.baths,
        h.property_type, h.square_feet, h.lot_size, h.year_built,
        h.open_house_start, h.open_house_end, h.url, h.latitude, h.longitude, h.day_key,
        h.id as house_id_ref
      FROM route_stops rs
      JOIN houses h ON rs.house_id = h.id
      WHERE rs.route_id = ?
      ORDER BY rs.stop_order
    `).all(route.id) as any[];

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(route.member_id) as any;

    return {
      ...route,
      route_geometry: route.route_geometry ? JSON.parse(route.route_geometry) : null,
      stops: stops.map((s: any) => ({
        id: s.id,
        route_id: s.route_id,
        house_id: s.house_id,
        stop_order: s.stop_order,
        arrival_time: s.arrival_time,
        departure_time: s.departure_time,
        travel_time_minutes: s.travel_time_minutes,
        house: {
          id: s.house_id,
          session_id: sessionId,
          address: s.address,
          city: s.city,
          state: s.state,
          zip: s.zip,
          price: s.price,
          beds: s.beds,
          baths: s.baths,
          property_type: s.property_type,
          square_feet: s.square_feet,
          lot_size: s.lot_size,
          year_built: s.year_built,
          open_house_start: s.open_house_start,
          open_house_end: s.open_house_end,
          url: s.url,
          latitude: s.latitude,
          longitude: s.longitude,
          day_key: s.day_key,
        },
      })),
      member,
    };
  });
}

export function getClaimedHouseIds(sessionId: string, excludeMemberId?: string): number[] {
  const db = getDb();
  let query = `
    SELECT DISTINCT rs.house_id
    FROM route_stops rs
    JOIN routes r ON rs.route_id = r.id
    WHERE r.session_id = ?
  `;
  const params: any[] = [sessionId];

  if (excludeMemberId) {
    query += ' AND r.member_id != ?';
    params.push(excludeMemberId);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r: any) => r.house_id);
}

export function deleteRoute(routeId: number) {
  const db = getDb();
  db.prepare('DELETE FROM route_stops WHERE route_id = ?').run(routeId);
  db.prepare('DELETE FROM routes WHERE id = ?').run(routeId);
}

export function getPreferences(memberId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM member_house_prefs WHERE member_id = ?').all(memberId) as any[];
}

export function getAllPreferences(sessionId: string): Record<string, any[]> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.* FROM member_house_prefs p
    JOIN members m ON p.member_id = m.id
    WHERE m.session_id = ?
  `).all(sessionId) as any[];

  const grouped: Record<string, any[]> = {};
  for (const row of rows) {
    if (!grouped[row.member_id]) grouped[row.member_id] = [];
    grouped[row.member_id].push(row);
  }
  return grouped;
}

export function setPreference(memberId: string, houseId: number, status: string) {
  const db = getDb();
  if (status === 'default') {
    db.prepare('DELETE FROM member_house_prefs WHERE member_id = ? AND house_id = ?').run(memberId, houseId);
  } else {
    db.prepare(`
      INSERT INTO member_house_prefs (member_id, house_id, status) VALUES (?, ?, ?)
      ON CONFLICT(member_id, house_id) DO UPDATE SET status = excluded.status
    `).run(memberId, houseId, status);
  }
}

export function setBulkPreferences(memberId: string, houseIds: number[], status: string) {
  const db = getDb();
  const setOne = db.transaction((ids: number[]) => {
    for (const houseId of ids) {
      if (status === 'default') {
        db.prepare('DELETE FROM member_house_prefs WHERE member_id = ? AND house_id = ?').run(memberId, houseId);
      } else {
        db.prepare(`
          INSERT INTO member_house_prefs (member_id, house_id, status) VALUES (?, ?, ?)
          ON CONFLICT(member_id, house_id) DO UPDATE SET status = excluded.status
        `).run(memberId, houseId, status);
      }
    }
  });
  setOne(houseIds);
}

export function getMemberExcludedIds(memberId: string): number[] {
  const db = getDb();
  const rows = db.prepare("SELECT house_id FROM member_house_prefs WHERE member_id = ? AND status = 'excluded'").all(memberId) as any[];
  return rows.map((r: any) => r.house_id);
}

export function getMemberFavoritedIds(memberId: string): number[] {
  const db = getDb();
  const rows = db.prepare("SELECT house_id FROM member_house_prefs WHERE member_id = ? AND status = 'favorited'").all(memberId) as any[];
  return rows.map((r: any) => r.house_id);
}
