# Open House Router

Optimize your team's open house visits with intelligent routing. Upload a Redfin CSV, set starting locations, and generate optimized routes that avoid duplication across team members.

## Features

- **CSV Import** — Upload a Redfin search export and auto-parse open house times, locations, and listing details
- **Smart Route Optimization** — Greedy nearest-neighbor algorithm with time-window constraints and 2-opt improvement
- **Team Collaboration** — Multiple team members in a shared session; routes automatically avoid houses already claimed by teammates
- **Multi-Day Planning** — Plan routes across Thursday–Sunday (or whatever days appear in your data) without duplicate visits
- **Interactive Map** — Leaflet-based map with color-coded route lines, numbered stop markers, and house detail popups
- **Adjustable Parameters** — Set your start/end time, time per stop (default 5 min), and starting location (address, map click, or geolocation)

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **SQLite** via better-sqlite3 (zero-config, file-based)
- **Leaflet** + OpenStreetMap tiles (free, no API key)
- **OSRM** for travel time matrices and driving route geometry (free, no API key)
- **Nominatim** for address geocoding (free, no API key)
- **SWR** for real-time polling of team updates

**No API keys required** — everything uses free, open-source services.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Workflow

1. **Create a session** — give it a name, share the session code with teammates
2. **Upload CSV** — export your Redfin search results as CSV and upload
3. **Set your starting location** — type an address, click the map, or use browser geolocation
4. **Select a day** — pick which day you want to plan
5. **Set your schedule** — start time, end time, and time per stop
6. **Generate route** — the optimizer finds the most houses you can visit, respecting time windows
7. **Teammates do the same** — their routes automatically skip houses you've already claimed

## Route Optimization Algorithm

The optimizer uses a greedy nearest-neighbor heuristic with time-window constraints:

1. Filters houses to those open during your available window
2. Excludes houses already claimed by teammates
3. Builds a travel-time matrix via OSRM (falls back to Haversine estimates for large sets)
4. Greedily selects the next best stop based on travel time, wait time, and urgency (houses closing soon get priority)
5. Applies 2-opt local search to improve the route
6. Fetches driving geometry from OSRM for map display
