// Qloo client: live calls to the hackathon API, or deterministic mock data when no key is set.
// Responses are trimmed and cached in server memory only (never written to disk or the repo).

const BASE = "https://hackathon.api.qloo.com";

export type Movie = {
  id: string;
  name: string;
  year?: number;
  releaseDate?: string; // YYYY-MM-DD
  image?: string;
  affinity?: number;
  popularity?: number;
  tags: string[];
  mock?: boolean;
};

export type Entity = { id: string; name: string; type: string; affinity?: number; popularity?: number; tags: string[]; image?: string };
export type Demographics = { age: Record<string, number>; gender: Record<string, number> };
export type HeatCell = { lat: number; lon: number; affinity: number };

export type QlooCall = { endpoint: string; params: Record<string, string>; count: number; mock: boolean; ms: number; error?: string };

export const qlooLive = () => Boolean(process.env.QLOO_API_KEY);

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 1000 * 60 * 60 * 6;

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const key = `${path}?${qs}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  let lastErr: unknown;
  for (const wait of [0, 700, 1500]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: { "X-Api-Key": process.env.QLOO_API_KEY! },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      cache.set(key, { at: Date.now(), data });
      return data;
    }
    lastErr = new Error(`Qloo ${path} ${res.status}: ${(await res.text()).slice(0, 160)}`);
    if (res.status !== 429 && res.status < 500) break;
  }
  throw lastErr;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const tagNames = (tags: any) =>
  (Array.isArray(tags) ? tags : [])
    .filter((t: any) => t?.name && !/keyword|place|brand/.test(String(t.type ?? "")))
    .slice(0, 10)
    .map((t: any) => String(t.name));

function yearOf(e: any): number | undefined {
  const y = e.properties?.release_year ?? Number(String(e.disambiguation ?? "").match(/\b(19|20)\d{2}\b/)?.[0]);
  return Number.isFinite(y) ? Number(y) : undefined;
}

function toMovie(e: any): Movie {
  const rd = e.properties?.release_date;
  return {
    id: e.entity_id ?? e.id,
    name: e.name,
    year: yearOf(e),
    releaseDate: typeof rd === "string" ? rd.slice(0, 10) : undefined,
    image: e.properties?.image?.url ?? undefined,
    affinity: e.query?.affinity,
    popularity: e.popularity,
    tags: tagNames(e.tags),
  };
}

const toEntity = (e: any): Entity => ({
  id: e.entity_id ?? e.id,
  name: e.name,
  type: e.subtype ?? e.type ?? "",
  affinity: e.query?.affinity,
  popularity: e.popularity,
  tags: tagNames(e.tags),
  image: e.properties?.image?.url ?? undefined,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

async function call<T>(
  log: QlooCall[],
  endpoint: string,
  path: string,
  params: Record<string, string>,
  parse: (d: any) => T, // eslint-disable-line @typescript-eslint/no-explicit-any
  mock: () => T,
  count: (t: T) => number,
): Promise<T> {
  const t0 = Date.now();
  if (!qlooLive()) {
    const out = mock();
    log.push({ endpoint, params, count: count(out), mock: true, ms: 0 });
    return out;
  }
  try {
    const out = parse(await get(path, params));
    log.push({ endpoint, params, count: count(out), mock: false, ms: Date.now() - t0 });
    return out;
  } catch (e) {
    log.push({ endpoint, params, count: 0, mock: false, ms: Date.now() - t0, error: String(e).slice(0, 160) });
    throw e;
  }
}

const len = <X,>(x: X[]) => x.length;

export function searchMovies(query: string, log: QlooCall[]) {
  const params = { query, types: "urn:entity:movie", take: "5" };
  return call(log, "/search", "/search", params, (d): Movie[] => (d?.results ?? []).map(toMovie), () => mock.search(query), len);
}

// Every film Qloo knows releasing in [from, to]. Qloo's release_date filter is ignored on the
// hackathon API, so we page through release_year and filter dates ourselves.
export async function slate(from: string, to: string, log: QlooCall[], exclude: string[] = []): Promise<Movie[]> {
  const out = new Map<string, Movie>();
  const page = (y: number, p: number) => {
    const params = {
      "filter.type": "urn:entity:movie",
      "filter.release_year.min": String(y),
      "filter.release_year.max": String(y),
      // Films that actually reach US theaters; drops e.g. local Russian or Norwegian releases.
      "filter.release_country": "United States,United Kingdom,Canada,Australia",
      "operator.filter.release_country": "union",
      take: "50",
      page: String(p),
    };
    return call(log, "/v2/insights · release slate", "/v2/insights", params, (d): Movie[] => (d?.results?.entities ?? []).map(toMovie), () => (p === 1 ? mock.slate(from, to) : []), len);
  };
  // Page through the whole year (Qloo returns popular films first; small same-audience films come later),
  // four pages at a time.
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (let p = 1; p <= 12; p += 4) {
      const batch = await Promise.all([p, p + 1, p + 2, p + 3].map((n) => page(y, n).catch(() => [] as Movie[])));
      for (const m of batch.flat()) if (m.releaseDate && m.releaseDate >= from && m.releaseDate <= to && !exclude.includes(m.id)) out.set(m.id, m);
      if (batch.some((b) => b.length < 50)) break;
    }
  }
  return [...out.values()];
}

// Upcoming films with posters, for the landing-page marquee. One cached call.
export async function upcomingPosters(log: QlooCall[]): Promise<{ name: string; url: string; date: string }[]> {
  if (!qlooLive()) return [];
  const y = new Date().getUTCFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const params = {
    "filter.type": "urn:entity:movie",
    "filter.release_year.min": String(y),
    "filter.release_year.max": String(y + 1),
    "filter.release_country": "United States",
    take: "50",
  };
  const films = await call(log, "/v2/insights · upcoming posters", "/v2/insights", params, (d): Movie[] => (d?.results?.entities ?? []).map(toMovie), () => [], len);
  return films
    .filter((m) => m.image && m.releaseDate && m.releaseDate >= today)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 16)
    .map((m) => ({ name: m.name, url: m.image!, date: m.releaseDate! }));
}

// Taste tags two audiences share (Qloo Analysis Compare). The count of shared tags is the overlap signal.
export function compareAudience(ours: string[], film: Movie, log: QlooCall[]) {
  const params = { "a.signal.interests.entities": ours.join(","), "b.signal.interests.entities": film.id, take: "50" };
  return call(
    log,
    `/v2/analysis/compare · ${film.name.slice(0, 28)}`,
    "/v2/analysis/compare",
    params,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (d): string[] => [...new Set<string>((d?.results?.tags ?? []).map((t: any) => String(t.name)))],
    () => mock.compare(film.id),
    len,
  );
}

export function demographics(signalIds: string[], log: QlooCall[]) {
  const params = { "filter.type": "urn:demographics", "signal.interests.entities": signalIds.join(",") };
  return call(
    log,
    "/v2/insights · demographics",
    "/v2/insights",
    params,
    // Qloo returns one row per signal entity; average them into one audience.
    (d): Demographics | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = (d?.results?.demographics ?? []).map((r: any) => r.query).filter(Boolean);
      if (!rows.length) return null;
      const avg = (k: "age" | "gender") => {
        const acc: Record<string, number> = {};
        for (const r of rows) for (const [key, v] of Object.entries(r[k] ?? {})) acc[key] = (acc[key] ?? 0) + Number(v) / rows.length;
        return Object.fromEntries(Object.entries(acc).map(([key, v]) => [key, Math.round(v * 100) / 100]));
      };
      return { age: avg("age"), gender: avg("gender") };
    },
    () => (signalIds[0]?.startsWith("mock-slate") && signalIds[0].endsWith("3") ? null : mock.demographics(signalIds.join())),
    (x) => (x ? 1 : 0),
  );
}

export function related(type: string, signalIds: string[], log: QlooCall[]) {
  // Cap popularity so universally popular picks (seen for every audience) drop out.
  const params = { "filter.type": type, "signal.interests.entities": signalIds.join(","), "filter.popularity.max": "0.97", take: "8" };
  return call(log, `/v2/insights · ${type.split(":").pop()}`, "/v2/insights", params, (d): Entity[] => (d?.results?.entities ?? []).map(toEntity), () => mock.related(type), len);
}

// Continental US bounding box; Qloo returns geohash cells with the signal's affinity.
const US = "POLYGON((-125 24, -66 24, -66 49.5, -125 49.5, -125 24))";

export function heatmap(signalIds: string[], log: QlooCall[]) {
  const params = { "filter.type": "urn:heatmap", "filter.location": US, "signal.interests.entities": signalIds.join(",") };
  return call(
    log,
    "/v2/insights · heatmap",
    "/v2/insights",
    params,
    (d): HeatCell[] =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d?.results?.heatmap ?? []).map((c: any) => ({
        lat: c.location?.latitude ?? c.location?.lat,
        lon: c.location?.longitude ?? c.location?.lon,
        affinity: c.query?.affinity ?? 0,
      })),
    () => mock.heatmap(),
    len,
  );
}

/* ---------------- mock data (only when QLOO_API_KEY is unset) ---------------- */

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
}

const MOCK_SLATE = [
  "Starfall Protocol", "The Lantern House", "Paper Kingdoms", "Night Shift at Hollow Creek", "Big Little Dragons",
  "The Last Good Summer", "Ironclad II", "Velvet Hour", "Saltwater", "Ghost Frequency", "Dear Mira", "The Long Con",
  "Kid Comet", "Wolves of Tharn", "Second Bloom", "Midnight Bakery",
];
const MOCK_TAGS = ["Dark", "Atmospheric", "Family", "Coming of age", "Psychological", "Witty", "Epic", "Slow burn", "Heartwarming", "Supernatural"];

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const mock = {
  search(q: string): Movie[] {
    const r = rng(q);
    return [{ id: `mock-${q.toLowerCase().replace(/\W+/g, "-")}`, name: q, year: 2015 + Math.floor(r() * 9), tags: [MOCK_TAGS[Math.floor(r() * 10)]], popularity: 0.9, mock: true }];
  },
  slate(start: string, end: string): Movie[] {
    const span = Math.max(7, (Date.parse(end) - Date.parse(start)) / 864e5);
    return MOCK_SLATE.map((n, i) => {
      const r = rng(n);
      const fri = addDays(start, Math.floor((r() * span) / 7) * 7 + ((5 - new Date(start).getUTCDay() + 7) % 7));
      return { id: `mock-slate-${i}`, name: `${n} (mock)`, releaseDate: fri, year: Number(fri.slice(0, 4)), popularity: Math.round((0.2 + r() * 0.8) * 100) / 100, tags: [MOCK_TAGS[i % 10], MOCK_TAGS[(i + 4) % 10]], mock: true };
    });
  },
  compare(id: string): string[] {
    const r = rng(id);
    return [...MOCK_TAGS].sort(() => r() - 0.5).slice(0, Math.floor(r() * r() * 16) + 1);
  },
  demographics(seed: string): Demographics {
    const r = rng(seed);
    const keys = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];
    const peak = Math.floor(r() * 6);
    return {
      age: Object.fromEntries(keys.map((k, i) => [k, Math.round((0.5 - Math.abs(i - peak) * 0.22 + (r() - 0.5) * 0.1) * 100) / 100])),
      gender: { female: Math.round((r() - 0.5) * 60) / 100, male: Math.round((r() - 0.5) * 60) / 100 },
    };
  },
  related(type: string): Entity[] {
    const names: Record<string, string[]> = {
      "urn:entity:tv_show": ["Prestige Drama Series", "Late Night Show", "Horror Anthology", "Animated Comedy"],
    };
    return (names[type] ?? []).map((n, i) => ({ id: `mock-${type}-${i}`, name: `${n} (mock)`, type, affinity: Math.round((0.92 - i * 0.09) * 100) / 100, tags: [MOCK_TAGS[i]] }));
  },
  heatmap(): HeatCell[] {
    const r = rng("us");
    return MARKETS.map((m) => ({ lat: m.lat, lon: m.lon, affinity: Math.round(r() * 100) / 100 }));
  },
};

// Major US theatrical markets (for aggregating heatmap cells into opening-market recommendations).
export const MARKETS = [
  { name: "New York", lat: 40.7128, lon: -74.006 },
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
  { name: "Chicago", lat: 41.8781, lon: -87.6298 },
  { name: "Dallas–Fort Worth", lat: 32.7767, lon: -96.797 },
  { name: "San Francisco Bay Area", lat: 37.7749, lon: -122.4194 },
  { name: "Houston", lat: 29.7604, lon: -95.3698 },
  { name: "Washington, DC", lat: 38.9072, lon: -77.0369 },
  { name: "Philadelphia", lat: 39.9526, lon: -75.1652 },
  { name: "Atlanta", lat: 33.749, lon: -84.388 },
  { name: "Boston", lat: 42.3601, lon: -71.0589 },
  { name: "Phoenix", lat: 33.4484, lon: -112.074 },
  { name: "Seattle", lat: 47.6062, lon: -122.3321 },
  { name: "Miami", lat: 25.7617, lon: -80.1918 },
  { name: "Denver", lat: 39.7392, lon: -104.9903 },
  { name: "Austin", lat: 30.2672, lon: -97.7431 },
  { name: "Portland", lat: 45.5152, lon: -122.6784 },
  { name: "Minneapolis", lat: 44.9778, lon: -93.265 },
  { name: "Detroit", lat: 42.3314, lon: -83.0458 },
];
