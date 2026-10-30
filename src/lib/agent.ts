// Counterprogram agent: Gemini plans its own investigation with Qloo tools, shortlists and tests candidate
// weekends, and submits a release plan. The server checks the plan against Qloo's numbers and sends it back
// for revision when it contradicts them.
// Without GEMINI_API_KEY a scripted agent runs the same tools so the app still works.
import { GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration } from "@google/genai";
import {
  MARKETS,
  compareAudience,
  demographics,
  heatmap,
  qlooLive,
  related,
  searchMovies,
  slate,
  type Demographics,
  type Entity,
  type Movie,
  type QlooCall,
} from "./qloo";

export type TasteTag = { name: string; weight: number };

export type FilmInput = { title: string; logline: string; comps: string[]; start: string; end: string };

export type Threat = Movie & { overlap: number; size: number; shared: string[]; threat: number };
export type Weekend = { friday: string; risk: number; opening: string[]; holdover: string[] };
export type Rival = {
  rival: Threat;
  similarity: number;
  verdict: "Same crowd" | "Partial overlap" | "Different crowd";
  ours: Demographics | null;
  theirs: Demographics | null;
  shared: string[];
  onlyOurs: string[];
  onlyTheirs: string[];
};
export type Market = { name: string; lat: number; lon: number; score: number };
export type Channels = { tv: Entity[] };
export type Plan = {
  headline: string;
  recommended_friday: string;
  alternates: string[];
  avoid: { friday: string; rival_id: string; reason: string }[];
  counterprogram: { rival_id: string; reason: string } | null;
  rationale: string;
  opening_markets: string[];
  marketing: { entity_id: string; angle: string }[];
  risks: string[];
  confidence: "high" | "medium" | "low";
  dropped_unverified: number;
  dropped: string[];
};

export type AgentEvent =
  | { type: "meta"; qlooLive: boolean; llm: string }
  | { type: "step"; text: string; kind?: "think" | "check" }
  | { type: "call"; call: QlooCall }
  | { type: "resolved"; film: Movie | null; comps: Movie[]; rejected: string[] }
  | { type: "profile"; demo: Demographics | null; tags: TasteTag[] }
  | { type: "calendar"; weekends: Weekend[]; films: Threat[] }
  | { type: "rival"; rival: Rival }
  | { type: "markets"; markets: Market[] }
  | { type: "channels"; channels: Channels }
  | { type: "plan"; plan: Plan }
  | { type: "baseline"; text: string }
  | { type: "error"; text: string }
  | { type: "done" };

/* ---------------- scoring (pure, reproducible) ---------------- */

const round = (x: number) => Math.round(x * 100) / 100;

function fridays(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  for (; d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 7)) out.push(d.toISOString().slice(0, 10));
  return out;
}

const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

// Overlap = shared taste tags from Qloo compare, weighted like TF-IDF: a tag most releases share with us
// ("Action", "Hero's Journey") says little; a rare one ("Biography", "Gritty") says a lot. Normalised by the
// second-highest film in the window so one outlier doesn't flatten everyone else.
export function scoreCalendar(scored: { film: Movie; shared: string[] }[], start: string, end: string) {
  const n = scored.length;
  const df = new Map<string, number>();
  for (const { shared } of scored) for (const t of new Set(shared)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log((n + 1) / ((df.get(t) ?? 0) + 0.5));
  const raw = scored.map(({ shared }) => [...new Set(shared)].reduce((sum, t) => sum + idf(t), 0));
  const norm = [...raw].sort((a, b) => b - a)[Math.min(1, raw.length - 1)] || 1;
  const films: Threat[] = scored
    .map(({ film, shared }, i) => {
      const overlap = Math.min(1, raw[i] / norm);
      shared = [...new Set(shared)].sort((a, b) => idf(b) - idf(a));
      const size = film.popularity ?? 0.3;
      return { ...film, shared, overlap: round(overlap), size: round(size), threat: round(overlap * (0.35 + 0.65 * size)) };
    })
    .sort((a, b) => b.threat - a.threat);

  const weekends: Weekend[] = fridays(start, end).map((friday) => {
    let safe = 1;
    const opening: string[] = [];
    const holdover: string[] = [];
    for (const f of films) {
      const dd = days(friday, f.releaseDate!);
      const w = dd >= -3 && dd <= 3 ? 1 : dd > 3 && dd <= 10 ? 0.5 : dd > 10 && dd <= 17 ? 0.2 : 0;
      if (!w) continue;
      safe *= 1 - f.threat * w;
      (w === 1 ? opening : holdover).push(f.id);
    }
    return { friday, risk: round(1 - safe), opening, holdover };
  });
  return { films, weekends };
}

const AGE_KEYS = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];

function vec(d: Demographics) {
  return [...AGE_KEYS.map((k) => d.age[k] ?? 0), d.gender.female ?? 0, d.gender.male ?? 0];
}

function cosine(a: number[], b: number[]) {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const n = Math.hypot(...a) * Math.hypot(...b);
  return n ? dot / n : 0;
}

export function compareCrowds(rival: Threat, ours: Demographics | null, theirs: Demographics | null, ourTags: TasteTag[]) {
  // Taste overlap comes from Qloo compare; coarse age/gender buckets only refine it (20%) when both films have them
  // (unreleased films often don't yet).
  const demo = ours && theirs ? (cosine(vec(ours), vec(theirs)) + 1) / 2 : null;
  const similarity = round(demo == null ? rival.overlap : 0.8 * rival.overlap + 0.2 * demo);
  const verdict: Rival["verdict"] = similarity >= 0.55 ? "Same crowd" : similarity >= 0.33 ? "Partial overlap" : "Different crowd";
  const shared = new Set(rival.shared);
  return {
    similarity,
    verdict,
    shared: rival.shared.slice(0, 6),
    onlyOurs: [...new Set(ourTags.map((t) => t.name))].filter((t) => !shared.has(t)).slice(0, 5),
    onlyTheirs: [...new Set(rival.tags)].filter((t) => !shared.has(t)).slice(0, 5),
  };
}

async function mapLimit<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const k = i++;
        out[k] = await fn(xs[k]);
      }
    }),
  );
  return out;
}


// Mean affinity of the heatmap cells around each market (max saturates near 1 everywhere).
function rankMarkets(cells: { lat: number; lon: number; affinity: number }[]): Market[] {
  return MARKETS.map((m) => {
    const near = cells.filter((c) => c.lat != null && Math.hypot(c.lat - m.lat, (c.lon - m.lon) * Math.cos((m.lat * Math.PI) / 180)) < 0.6);
    return { ...m, score: round(near.length ? near.reduce((a, c) => a + c.affinity, 0) / near.length : 0) };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

// How well a Qloo search result matches what the user typed (0-1). Guards against Qloo returning its nearest
// neighbour for a title it doesn't have ("Another Fake Movie" -> "Not Another Teen Movie").
function titleMatch(query: string, name: string) {
  const norm = (x: string) =>
    x.toLowerCase().replace(/\(?\b(19|20)\d{2}\b\)?/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !["the", "a", "an", "of"].includes(w));
  const q = norm(query);
  const n = new Set(norm(name));
  if (!q.length || !n.size) return 0;
  const hit = q.filter((w) => n.has(w)).length;
  return Math.min(hit / q.length, hit / n.size);
}

const fmtDay = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/* ---------------- run state + tools ---------------- */

class Run {
  log: QlooCall[] = [];
  film: Movie | null = null;
  comps: Movie[] = [];
  ourDemo: Demographics | null = null;
  ourTags: TasteTag[] = [];
  films: Threat[] = [];
  weekends: Weekend[] = [];
  rivals = new Map<string, Rival>();
  tested = new Set<string>();
  channels: Channels | null = null;
  markets: Market[] = [];
  critiques = 0;
  thin = 0; // releases per week Qloo knows in the window
  failedCompares = 0;
  rejected: string[] = [];

  constructor(private input: FilmInput, private emit: (e: AgentEvent) => void) {}

  flush() {
    while (this.log.length) this.emit({ type: "call", call: this.log.shift()! });
  }
  ids() {
    return this.comps.map((c) => c.id);
  }
  name(id: string) {
    return this.films.find((f) => f.id === id)?.name ?? id;
  }
  // The model sometimes passes a film's name instead of its id; accept either.
  filmId(ref?: string) {
    if (!ref) return undefined;
    const r = ref.trim().toLowerCase().replace(/\s*\(\d{4}\)$/, "");
    return (
      this.films.find((f) => f.id === ref.trim() || f.name.toLowerCase() === r) ??
      this.films.find((f) => r.length > 3 && (f.name.toLowerCase().includes(r) || r.includes(f.name.toLowerCase())))
    )?.id;
  }
  risk(friday: string) {
    return this.weekends.find((w) => w.friday === friday)?.risk ?? 1;
  }
  safest(n = 3) {
    return [...this.weekends].sort((a, b) => a.risk - b.risk).slice(0, n);
  }

  async resolveTitles(filmTitle: string, asked: string[]) {
    // The agent may retry a title with a correction, but may never swap in films the user didn't name:
    // the comps define the audience, so inventing them would invent the answer.
    const own = this.input.comps;
    const invented = asked.filter((q) => !own.some((o) => titleMatch(o, q) >= 0.6 || titleMatch(q, o) >= 0.6));
    const comps = asked.filter((q) => !invented.includes(q));
    if (!comps.length) return { error: `Only the user's own comparable titles can be used (${own.join("; ")}). You may correct their spelling or add a year, not replace them.` };
    this.emit({ type: "step", text: `Looking up your comparable films in Qloo: ${comps.join(", ")}` });
    const pick = async (q: string) => (await searchMovies(q, this.log).catch(() => [])) as Movie[];
    const [film, ...lists] = await Promise.all([pick(filmTitle), ...comps.slice(0, 5).map(pick)]);
    // Only treat the film as "already in Qloo" when the name matches and it releases inside the window
    // (that's a replay); otherwise a same-named older film would be wrongly excluded.
    const f = film[0];
    const { start, end } = this.input;
    this.film = f && f.name.toLowerCase() === filmTitle.toLowerCase() && f.releaseDate && f.releaseDate >= start && f.releaseDate <= end ? f : null;
    // Take the best-matching result, and only keep comps that genuinely match the title asked for.
    const best = lists.map((l, i) => [...l].sort((a, b) => titleMatch(comps[i], b.name) - titleMatch(comps[i], a.name))[0]);
    this.rejected = comps.filter((q, i) => !best[i] || titleMatch(q, best[i].name) < 0.6);
    this.comps = best.filter((m, i) => m && titleMatch(comps[i], m.name) >= 0.6);
    this.flush();
    this.emit({ type: "resolved", film: this.film, comps: this.comps, rejected: this.rejected });
    return {
      film_in_qloo: this.film ? { id: this.film.id, name: this.film.name, release: this.film.releaseDate } : null,
      comps: comps.map((q, i) => ({ query: q, match: best[i] ? `${best[i].name} (${best[i].year ?? "?"})` : null, accepted: !this.rejected.includes(q) })),
      note: this.comps.length
        ? "Rejected titles were not found in Qloo (the closest result was a different film). Retry them with a corrected title or year, or continue with the accepted ones."
        : "None of the titles were found in Qloo. Retry with corrected titles; if that fails, stop and say so.",
    };
  }

  async profile() {
    this.emit({ type: "step", text: "Asking Qloo who watches these films: age, gender and taste" });
    this.ourDemo = await demographics(this.ids(), this.log).catch(() => null);
    const counts = new Map<string, number>();
    for (const c of this.comps) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    this.ourTags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([name, n]) => ({ name, weight: n / this.comps.length }));
    this.flush();
    this.emit({ type: "profile", demo: this.ourDemo, tags: this.ourTags });
    return { age_affinity: this.ourDemo?.age ?? "unavailable", gender_affinity: this.ourDemo?.gender ?? "unavailable", top_tags: this.ourTags.map((t) => t.name) };
  }

  async scanCalendar() {
    if (this.weekends.length) return { note: "Calendar already scanned; use the earlier result.", weekends: this.weekends.map((w) => ({ friday: w.friday, risk: w.risk })) };
    const { start, end } = this.input;
    this.emit({ type: "step", text: `Asking Qloo for every film releasing ${fmtDay(start)} – ${fmtDay(end)}` });
    const exclude = [this.film?.id, ...this.ids()].filter(Boolean) as string[];
    // Start 17 days early so films already in theaters count as holdovers on the first Fridays.
    const from = new Date(Date.parse(start) - 17 * 864e5).toISOString().slice(0, 10);
    const all = await slate(from, end, this.log, exclude);
    this.flush();
    // Compare against the biggest releases, but keep the top two of every week so no weekend looks
    // falsely empty just because its films are smaller.
    const byWeek = new Map<number, Movie[]>();
    for (const m of all) {
      const wk = Math.floor(Date.parse(m.releaseDate!) / (7 * 864e5));
      byWeek.set(wk, [...(byWeek.get(wk) ?? []), m]);
    }
    // Pre-screen with the taste tags Qloo already attaches to each film (free), so films that look like ours get
    // the full compare even when they're small; big films always get it because they can hurt any opening.
    const ours = new Set(this.comps.flatMap((c) => c.tags));
    const looksLike = (m: Movie) => (ours.size ? m.tags.filter((t) => ours.has(t)).length / Math.min(ours.size, 8) : 0);
    const priority = (m: Movie) => (m.popularity ?? 0) + 1.5 * looksLike(m);
    const byPriority = (a: Movie, b: Movie) => priority(b) - priority(a);
    const picked = new Map<string, Movie>();
    for (const ms of byWeek.values()) for (const m of ms.sort(byPriority).slice(0, 2)) picked.set(m.id, m);
    for (const m of [...all].sort(byPriority)) if (picked.size < 32) picked.set(m.id, m);
    this.thin = all.length / Math.max(1, fridays(start, end).length);
    const contenders = [...picked.values()];
    this.emit({ type: "step", text: `Found ${all.length} releases. Comparing your audience's taste with the ${contenders.length} that matter most` });
    const scored = await mapLimit(contenders, 6, async (film) => ({
      film,
      shared: await compareAudience(this.ids(), film, this.log).catch(() => (this.failedCompares++, [] as string[])),
    }));
    this.flush();
    const { films, weekends } = scoreCalendar(scored, start, end);
    this.films = films;
    this.weekends = weekends;
    this.emit({ type: "calendar", weekends, films });
    return {
      releases_in_window: all.length,
      data_note: this.thin < 1.5 ? "Few releases are known this far out; treat empty weekends with caution." : undefined,
      compared: contenders.length,
      weekends: weekends.map((w) => ({ friday: w.friday, risk: w.risk, opening: w.opening.map((id) => this.name(id)) })),
      top_threats: films.slice(0, 8).map((f) => ({ id: f.id, name: f.name, release: f.releaseDate, overlap: f.overlap, size: f.size, shared_tags: f.shared.slice(0, 5) })),
      big_low_overlap_films: films.filter((f) => f.size >= 0.4 && f.overlap < 0.35).sort((a, b) => b.size - a.size).slice(0, 4).map((f) => ({ id: f.id, name: f.name, release: f.releaseDate, overlap: f.overlap, size: f.size })),
    };
  }

  async compareRival(ref: string, quiet = false) {
    const rivalId = this.filmId(ref) ?? ref;
    const rival = this.films.find((f) => f.id === rivalId);
    if (!rival) return { error: "Unknown film id; use an id from scan_calendar or test_weekend." };
    if (this.rivals.has(rivalId)) return this.rivalSummary(this.rivals.get(rivalId)!);
    if (!quiet) this.emit({ type: "step", text: `Same crowd or different? Comparing your audience with ${rival.name}` });
    if (!this.ourTags.length) await this.profile();
    const theirs = await demographics([rivalId], this.log).catch(() => null);
    this.flush();
    const c = compareCrowds(rival, this.ourDemo, theirs, this.ourTags);
    const r: Rival = { rival, ours: this.ourDemo, theirs, ...c };
    this.rivals.set(rivalId, r);
    this.emit({ type: "rival", rival: r });
    return this.rivalSummary(r);
  }

  rivalSummary(r: Rival) {
    return { id: r.rival.id, film: r.rival.name, release: r.rival.releaseDate, size: r.rival.size, similarity: r.similarity, verdict: r.verdict, demographics_available: Boolean(r.theirs), shared_tags: r.shared, only_theirs: r.onlyTheirs };
  }

  // Deep-dive one candidate Friday: who opens within two weeks either side, and are they our crowd?
  async testWeekend(friday: string) {
    const w = this.weekends.find((x) => x.friday === friday);
    if (!w) return { error: `${friday} is not a Friday in the window. Valid: ${this.weekends.map((x) => x.friday).join(", ")}` };
    this.tested.add(friday);
    this.emit({ type: "step", text: `Testing ${fmtDay(friday)} as an opening date: who else is in theaters that fortnight?` });
    const nearby = this.films
      .filter((f) => Math.abs(days(f.releaseDate!, friday)) <= 14)
      .sort((a, b) => b.threat - a.threat)
      .slice(0, 3);
    const crowds = await Promise.all(nearby.map((f) => this.compareRival(f.id, true)));
    return {
      friday,
      risk: w.risk,
      rank_among_fridays: [...this.weekends].sort((a, b) => a.risk - b.risk).findIndex((x) => x.friday === friday) + 1,
      of: this.weekends.length,
      nearby_releases: crowds,
      safest_fridays: this.safest().map((x) => ({ friday: x.friday, risk: x.risk })),
    };
  }

  async rankMarkets() {
    this.emit({ type: "step", text: "Asking Qloo where in the US this audience is concentrated" });
    const cells = await heatmap(this.ids(), this.log).catch(() => []);
    this.flush();
    this.markets = rankMarkets(cells);
    this.emit({ type: "markets", markets: this.markets });
    return { ranked_markets: this.markets.slice(0, 10).map((m) => ({ name: m.name, score: m.score })) };
  }

  async findChannels() {
    this.emit({ type: "step", text: "Asking Qloo which TV shows this audience watches (for trailer placement and press)" });
    const tv = await related("urn:entity:tv_show", this.ids(), this.log).catch(() => [] as Entity[]);
    this.flush();
    this.channels = { tv };
    this.emit({ type: "channels", channels: this.channels });
    const brief = (xs: Entity[]) => xs.slice(0, 6).map((e) => ({ id: e.id, name: e.name, affinity: e.affinity }));
    return { tv_shows: brief(tv) };
  }

  // Server-side self-check: the plan must agree with Qloo's numbers. Returns a critique, or null if it passes.
  critique(raw: Partial<Plan>): string | null {
    const rec = raw.recommended_friday ?? "";
    if (!this.weekends.some((w) => w.friday === rec)) return `recommended_friday ${rec} is not one of the Fridays from scan_calendar.`;
    if (this.tested.size < 2) return "Test at least two candidate Fridays with test_weekend before deciding.";
    const best = this.safest(1)[0];
    const r = this.risk(rec);
    if (r > best.risk + 0.15) {
      const alts = this.safest().filter((w) => w.risk < r).map((w) => `${w.friday} (${Math.round(w.risk * 100)}%)`).join(", ");
      return `Your pick ${rec} has ${Math.round(r * 100)}% overlap risk, but ${alts} are safer. Either switch, or keep it only if a safer date has a concrete problem you can name from tool results, and state that trade-off in the rationale.`;
    }
    const bad = (raw.alternates ?? []).filter((d) => this.risk(d) > r + 0.25);
    if (bad.length && this.critiques === 0) return `Alternates ${bad.join(", ")} are much riskier than your pick; choose alternates from the safer Fridays.`;
    return null;
  }

  // Keep only what Qloo actually returned: valid weekends, rival ids and channel ids.
  verify(raw: Partial<Plan>, forced = false): Plan {
    const dropped: string[] = [];
    const fri = new Set(this.weekends.map((w) => w.friday));
    const film = new Set(this.films.map((f) => f.id));
    const ch = new Set(this.channels ? Object.values(this.channels).flat().map((e: Entity) => e.id) : []);
    const mk = new Set(this.markets.map((m) => m.name));
    const keep = <T>(xs: T[] | undefined, ok: (x: T) => boolean, label: (x: T) => string) =>
      (xs ?? []).filter((x) => (ok(x) ? true : (dropped.push(label(x)), false)));
    let rec = raw.recommended_friday ?? "";
    if (!fri.has(rec)) {
      dropped.push(`recommended date ${rec} (not a Friday in the window)`);
      rec = this.safest(1)[0]?.friday ?? "";
    }
    const r = this.risk(rec);
    const cpId = this.filmId(raw.counterprogram?.rival_id);
    const cp = raw.counterprogram && cpId ? { ...raw.counterprogram, rival_id: cpId } : null;
    if (raw.counterprogram && !cp) dropped.push(`counterprogramming target ${raw.counterprogram.rival_id} (not a Qloo result)`);
    const risks = raw.risks ?? [];
    if (forced) risks.unshift(`The agent kept ${rec} after the self-check flagged safer Fridays; weigh its stated trade-off.`);
    if (r > 0.4) risks.unshift(`Even the best Friday in this window carries ${Math.round(r * 100)}% overlap risk. Consider widening the window.`);
    const sparse = this.thin < 1.5;
    if (sparse) risks.unshift(`Qloo knows only about ${this.thin.toFixed(1)} releases per week in this window, so some films may not be announced yet. Quiet weekends may not stay quiet.`);
    const failed = this.failedCompares > 0.2 * Math.max(1, this.films.length);
    if (failed) risks.unshift(`${this.failedCompares} audience comparisons failed, so some overlap scores may be understated.`);
    if (this.rejected.length) risks.unshift(`Not found in Qloo, so not used: ${this.rejected.join(", ")}.`);
    return {
      headline: raw.headline ?? "",
      recommended_friday: rec,
      alternates: this.fillAlternates(
        keep(raw.alternates, (d) => fri.has(d) && d !== rec && this.risk(d) <= r + 0.25, (d) => `alternate ${d} (${fri.has(d) ? "much riskier than the pick" : "not a Friday in the window"})`),
        rec,
      ),
      avoid: this.fillAvoid(
        keep(
          (raw.avoid ?? []).map((a) => ({ ...a, rival_id: this.filmId(a.rival_id) ?? this.namedNear(a.reason, a.friday) ?? a.rival_id ?? "" })),
          (a) => fri.has(a.friday) && film.has(a.rival_id),
          (a) => `avoid-entry ${a.friday} (film not in Qloo results)`,
        ),
      ),
      counterprogram: cp,
      rationale: raw.rationale ?? "",
      opening_markets: keep(raw.opening_markets, (m) => mk.has(m), (m) => `market "${m}" (not in Qloo heatmap ranking)`),
      marketing: keep(raw.marketing, (m) => ch.has(m.entity_id), (m) => `media pick ${m.entity_id} (not a Qloo result)`),
      risks,
      // The model's confidence can't exceed what the data supports.
      confidence: forced || failed || r > 0.6 || this.thin < 0.75 ? "low" : (r > 0.4 || sparse) && raw.confidence === "high" ? "medium" : raw.confidence ?? "medium",
      dropped_unverified: dropped.length,
      dropped,
    };
  }

  // The model often names the competing film in its reason but omits the id: take the named film, but only
  // if it really opens within two weeks of that Friday.
  namedNear(reason = "", friday = "") {
    const r = reason.toLowerCase();
    return this.films
      .filter((f) => r.includes(f.name.toLowerCase()) && Math.abs(days(f.releaseDate!, friday)) <= 14)
      .sort((a, b) => b.threat - a.threat)[0]?.id;
  }

  // Backfill from the data when the agent's own entries didn't survive the fact-check.
  fillAlternates(alts: string[], rec: string) {
    if (alts.length) return alts;
    const r = this.risk(rec);
    return this.safest(4).filter((w) => w.friday !== rec && w.risk <= r + 0.25).slice(0, 2).map((w) => w.friday);
  }
  fillAvoid(avoid: Plan["avoid"]) {
    if (avoid.length) return avoid;
    return [...this.weekends]
      .sort((a, b) => b.risk - a.risk)
      .filter((w) => w.opening.length || w.holdover.length)
      .slice(0, 2)
      .map((w) => {
        const id = [...w.opening, ...w.holdover].sort((a, b) => (this.films.find((f) => f.id === b)?.threat ?? 0) - (this.films.find((f) => f.id === a)?.threat ?? 0))[0];
        return { friday: w.friday, rival_id: id, reason: `${Math.round(w.risk * 100)}% overlap risk, led by ${this.name(id)}` };
      });
  }

  template(): Plan {
    const byRisk = this.safest(this.weekends.length);
    const rec = byRisk[0]?.friday ?? "";
    const worst = [...this.weekends].sort((a, b) => b.risk - a.risk).slice(0, 2);
    const cp = [...this.rivals.values()].filter((r) => r.verdict === "Different crowd").sort((a, b) => b.rival.size - a.rival.size)[0];
    return this.verify({
      headline: `Open ${this.input.title} on ${fmtDay(rec)}: the Friday with the least competition for your audience`,
      recommended_friday: rec,
      alternates: byRisk.slice(1, 3).map((w) => w.friday),
      avoid: worst.filter((w) => w.opening[0]).map((w) => ({ friday: w.friday, rival_id: w.opening[0], reason: `${Math.round(w.risk * 100)}% overlap risk` })),
      counterprogram: cp ? { rival_id: cp.rival.id, reason: `Big release with a different crowd (similarity ${cp.similarity})` } : null,
      rationale: `Lowest combined overlap risk (${Math.round((byRisk[0]?.risk ?? 0) * 100)}%) from films opening that weekend and those still in theaters.`,
      opening_markets: this.markets.slice(0, 5).map((m) => m.name),
      marketing: this.channels ? this.channels.tv.slice(0, 3).map((e) => ({ entity_id: e.id, angle: "High audience affinity" })) : [],
      risks: ["Audience overlap is one input; screens, marketing spend and reviews also move openings.", "Upcoming films have thinner taste data before release."],
      confidence: "medium",
    });
  }
}

/* ---------------- Gemini agent ---------------- */

const SYSTEM = `You are Counterprogram, a release-strategy agent working for a film distributor.
Goal: choose the Friday to open the film where the fewest releases compete for the same audience, name the weekends to avoid, find a big release with a DIFFERENT audience to counterprogram against (Barbenheimer-style), and pick opening markets and media.
You plan your own investigation with the tools. Never invent films, dates or numbers.
- Start with resolve_titles. If a comparable title matched the wrong film, resolve it again more specifically.
- Get the audience (profile_audience) and the release calendar (scan_calendar).
- Shortlist 2-3 promising Fridays and investigate each with test_weekend before choosing. Use compare_rival on any big release you want to understand (especially counterprogramming candidates).
- Use rank_markets and find_channels for where to open and how to reach the audience.
- Finish with submit_plan. The server checks your plan against the data and may send it back; if so, fix it.
Before each set of tool calls, write ONE short plain-English sentence (max 25 words) for the user saying what you're about to check and why, e.g. "Mar 19 looks crowded, so I'll test the quieter Apr 9 and Feb 26 instead." Call independent tools in the same turn to save time. Explain trade-offs in plain language with numbers (overlap risk %, similarity). Qloo affinities describe aggregate audiences, not individuals.`;

const strList = { type: "array", items: { type: "string" } };

const TOOLS: FunctionDeclaration[] = [
  {
    name: "resolve_titles",
    description: "Find the comparable titles (and the film itself, if it's a past release) in Qloo. Returns matches and alternatives.",
    parametersJsonSchema: { type: "object", properties: { film_title: { type: "string" }, comps: strList }, required: ["film_title", "comps"] },
  },
  { name: "profile_audience", description: "Age/gender affinity and taste tags of the comps' audience.", parametersJsonSchema: { type: "object", properties: {} } },
  {
    name: "scan_calendar",
    description: "Every film Qloo knows releasing in the window; the most important ones are compared with our audience (shared taste) and every Friday gets an overlap-risk score.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "test_weekend",
    description: "Investigate one candidate Friday: its risk and rank, the biggest releases within two weeks, and whether each is the same crowd.",
    parametersJsonSchema: { type: "object", properties: { friday: { type: "string", description: "YYYY-MM-DD" } }, required: ["friday"] },
  },
  {
    name: "compare_rival",
    description: "Head-to-head with one release: shared vs distinct taste and, when available, age/gender affinity.",
    parametersJsonSchema: { type: "object", properties: { rival_id: { type: "string" } }, required: ["rival_id"] },
  },
  { name: "rank_markets", description: "Rank US theatrical markets by where this audience concentrates (Qloo heatmap).", parametersJsonSchema: { type: "object", properties: {} } },
  { name: "find_channels", description: "TV shows this audience over-indexes on (for trailer placement, press and partnerships).", parametersJsonSchema: { type: "object", properties: {} } },
  {
    name: "submit_plan",
    description: "Submit the final release plan.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        headline: { type: "string" },
        recommended_friday: { type: "string" },
        alternates: strList,
        avoid: {
          type: "array",
          items: {
            type: "object",
            properties: { friday: { type: "string" }, rival_id: { type: "string", description: "id of the main competing film from scan_calendar" }, reason: { type: "string" } },
            required: ["friday", "rival_id", "reason"],
          },
        },
        counterprogram: { type: "object", properties: { rival_id: { type: "string" }, reason: { type: "string" } }, required: ["rival_id", "reason"] },
        rationale: { type: "string" },
        opening_markets: strList,
        marketing: { type: "array", items: { type: "object", properties: { entity_id: { type: "string" }, angle: { type: "string" } }, required: ["entity_id", "angle"] } },
        risks: strList,
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["headline", "recommended_friday", "alternates", "avoid", "rationale", "opening_markets", "marketing", "risks", "confidence"],
    },
  },
];

// Free-tier Gemini capacity varies by model; fall back down this list on overload or timeout.
const MODELS = [process.env.GEMINI_MODEL || "gemini-3.5-flash", "gemini-3.5-flash-lite"];
const MODEL = MODELS[0];

const describe = (f: FilmInput) => `Film: ${f.title}\nLogline: ${f.logline}\nComparable titles: ${f.comps.join("; ")}\nRelease window: ${f.start} to ${f.end} (US theatrical)`;

async function generate(ai: GoogleGenAI, req: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">, timeout = 30000) {
  let last: unknown;
  for (const model of MODELS) {
    try {
      return await ai.models.generateContent({ ...req, model, config: { ...req.config, httpOptions: { timeout } } });
    } catch (e) {
      last = e;
      if (!/429|500|503|UNAVAILABLE|RESOURCE_EXHAUSTED|abort|timeout|fetch failed/i.test(String(e))) throw e;
    }
  }
  throw last;
}

async function baseline(ai: GoogleGenAI, f: FilmInput) {
  const res = await generate(ai, {
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    contents: `You have no external data. As a film distributor's strategist, answer in under 120 words with bullets:\n${describe(f)}\nWhich Friday should it open, which competing releases should it avoid, and which US cities should it open in first?`,
  });
  return res.text ?? "";
}

export async function runAgent(input: FilmInput, emit: (e: AgentEvent) => void) {
  const run = new Run(input, emit);
  const key = process.env.GEMINI_API_KEY;
  emit({ type: "meta", qlooLive: qlooLive(), llm: key ? MODEL : "scripted (no GEMINI_API_KEY)" });

  if (!key) {
    emit({ type: "baseline", text: "(Add GEMINI_API_KEY to compare against an LLM-only answer.)" });
    return scripted(run, input, emit);
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const baselineP = baseline(ai, input)
    .then((text) => emit({ type: "baseline", text }))
    .catch(() => emit({ type: "baseline", text: "(LLM-only answer unavailable right now.)" }));

  const contents: Content[] = [{ role: "user", parts: [{ text: describe(input) }] }];
  let done = false;
  try {
    for (let turn = 0; turn < 14 && !done; turn++) {
      const res = await generate(ai, {
        contents,
        config: { systemInstruction: SYSTEM, tools: [{ functionDeclarations: TOOLS }], thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      });
      const content = res.candidates?.[0]?.content;
      if (content) contents.push(content);
      const calls = res.functionCalls ?? [];
      // Show the model's thought summary (or any text it wrote alongside its tool calls) as its reasoning.
      const thought = content?.parts?.filter((p) => p.text && !p.thought).map((p) => p.text).join(" ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
      if (thought) {
        // Keep the gist: drop filler openers and cap at two sentences.
        const gist = thought.replace(/^(okay|ok|alright|right|so|got it)[,.!:]?\s*/i, "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
        emit({ type: "step", kind: "think", text: gist.length > 220 ? gist.slice(0, 217) + "…" : gist });
      }
      if (!calls.length) {
        contents.push({ role: "user", parts: [{ text: "Continue with the tools and finish with submit_plan." }] });
        continue;
      }
      const parts = [];
      for (const c of calls) {
        const a = (c.args ?? {}) as Record<string, unknown>;
        let output: unknown;
        try {
          if (c.name === "resolve_titles") output = await run.resolveTitles(String(a.film_title ?? input.title), (a.comps as string[]) ?? input.comps);
          else if (!run.comps.length) output = { error: "No comparable titles resolved yet; call resolve_titles first." };
          else if (c.name === "profile_audience") output = await run.profile();
          else if (c.name === "scan_calendar") output = await run.scanCalendar();
          else if (!run.weekends.length && c.name !== "rank_markets" && c.name !== "find_channels") output = { error: "Call scan_calendar first." };
          else if (c.name === "test_weekend") output = await run.testWeekend(String(a.friday));
          else if (c.name === "compare_rival") output = await run.compareRival(String(a.rival_id));
          else if (c.name === "rank_markets") output = await run.rankMarkets();
          else if (c.name === "find_channels") output = await run.findChannels();
          else if (c.name === "submit_plan") {
            const issue = run.critique(a as Partial<Plan>);
            if (issue && run.critiques < 2) {
              run.critiques++;
              emit({ type: "step", kind: "check", text: `Self-check sent the plan back: ${issue}` });
              output = { rejected: issue };
            } else {
              if (run.critiques) emit({ type: "step", kind: "check", text: issue ? "Self-check: the agent kept its date and explained the trade-off" : "Self-check passed after the agent revised its plan" });
              else emit({ type: "step", kind: "check", text: "Self-check passed: the plan agrees with Qloo's numbers" });
              const cpRef = (a.counterprogram as { rival_id?: string } | undefined)?.rival_id;
              if (cpRef && run.filmId(cpRef)) await run.compareRival(cpRef);
              emit({ type: "plan", plan: run.verify(a as Partial<Plan>, Boolean(issue && issue.startsWith("Your pick"))) });
              done = true;
              output = { ok: true };
            }
          }
        } catch (e) {
          run.flush();
          output = { error: String(e).slice(0, 200) };
        }
        parts.push({ functionResponse: { id: c.id, name: c.name, response: { output } } });
      }
      contents.push({ role: "user", parts });
    }
    if (!done) await finish(run, input, emit, "Agent ran out of turns; finishing from Qloo results");
  } catch (e) {
    const quota = /429|quota|RESOURCE_EXHAUSTED/i.test(String(e));
    emit({
      type: "error",
      text: quota
        ? "The AI planner has hit its usage limit for now, so a rule-based planner finished the job with the same Qloo tools and checks."
        : "The AI planner is temporarily unavailable, so a rule-based planner finished the job with the same Qloo tools and checks.",
    });
    await finish(run, input, emit);
  }
  await baselineP;
}

async function finish(run: Run, input: FilmInput, emit: (e: AgentEvent) => void, note?: string) {
  if (note) emit({ type: "step", text: note });
  if (!run.weekends.length) return scripted(run, input, emit);
  if (!run.markets.length) await run.rankMarkets();
  if (!run.channels) await run.findChannels();
  emit({ type: "plan", plan: run.template() });
}

async function scripted(run: Run, input: FilmInput, emit: (e: AgentEvent) => void) {
  if (!run.comps.length) await run.resolveTitles(input.title, input.comps);
  if (!run.comps.length) {
    emit({ type: "error", text: "None of your similar films were found in Qloo, so there's no audience to analyse. Check the spelling or try better-known titles." });
    return;
  }
  await run.profile();
  await run.scanCalendar();
  for (const w of run.safest(2)) await run.testWeekend(w.friday);
  const big = [...run.films].filter((f) => f.size >= 0.4 && f.overlap < 0.35).sort((a, b) => b.size - a.size).slice(0, 1);
  for (const f of big) await run.compareRival(f.id);
  await run.rankMarkets();
  await run.findChannels();
  emit({ type: "plan", plan: run.template() });
}
