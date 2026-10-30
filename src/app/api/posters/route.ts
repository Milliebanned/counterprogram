import { upcomingPosters, type QlooCall } from "@/lib/qloo";

export const runtime = "nodejs";

// Poster URLs for the landing-page marquee. Cached in memory for 6 hours; empty when Qloo is unavailable.
let cache: { at: number; posters: Awaited<ReturnType<typeof upcomingPosters>> } | null = null;

export async function GET() {
  if (!cache || Date.now() - cache.at > 1000 * 60 * 60 * 6) {
    const log: QlooCall[] = [];
    const posters = await upcomingPosters(log).catch(() => []);
    if (posters.length) cache = { at: Date.now(), posters };
    else return Response.json({ posters: [] });
  }
  return Response.json({ posters: cache.posters }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
}
