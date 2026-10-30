import { runAgent, type AgentEvent, type FilmInput } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

// Replay identical briefs from memory (protects the free Gemini quota when judges try the samples),
// and cap fresh runs per IP.
const replay = new Map<string, { at: number; events: AgentEvent[] }>();
const REPLAY_TTL = 1000 * 60 * 30;
const hits = new Map<string, number[]>();
const LIMIT = 8;
const WINDOW = 1000 * 60 * 10;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(body: Partial<FilmInput>): FilmInput | string {
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const comps = Array.isArray(body.comps) ? body.comps.map((x) => s(x, 80)).filter(Boolean).slice(0, 5) : [];
  const t = { title: s(body.title, 100), logline: s(body.logline, 300), comps, start: s(body.start, 10), end: s(body.end, 10) };
  if (!t.title) return "Give your film a title.";
  if (!comps.length) return "Add at least one similar film.";
  if (!DATE.test(t.start) || !DATE.test(t.end)) return "Pick both release dates.";
  const span = (Date.parse(t.end) - Date.parse(t.start)) / 864e5;
  if (span < 7) return "The latest date must be at least a week after the earliest.";
  if (span > 200) return "Keep the window to about six months or less.";
  return t;
}

export async function POST(req: Request) {
  const input = clean(await req.json().catch(() => ({})));
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const key = JSON.stringify(input).toLowerCase();
  const cached = replay.get(key);
  const enc = new TextEncoder();

  if (!cached || Date.now() - cached.at > REPLAY_TTL) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const recent = (hits.get(ip) ?? []).filter((t) => Date.now() - t < WINDOW);
    if (recent.length >= LIMIT) return Response.json({ error: "Rate limit: try again in a few minutes, or open a sample." }, { status: 429 });
    hits.set(ip, [...recent, Date.now()]);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      if (cached && Date.now() - cached.at < REPLAY_TTL) {
        for (const e of cached.events) send(e);
        controller.close();
        return;
      }
      const events: AgentEvent[] = [];
      let failed = false;
      try {
        await runAgent(input, (e) => {
          if (e.type === "error") failed = true;
          events.push(e);
          send(e);
        });
      } catch (e) {
        failed = true;
        send({ type: "error", text: String(e).slice(0, 300) });
      }
      send({ type: "done" });
      if (!failed) replay.set(key, { at: Date.now(), events: [...events, { type: "done" }] });
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
