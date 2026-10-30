# Counterprogram

**Barbenheimer was counterprogramming. Counterprogram finds the next one.**

Counterprogram is a release-strategy agent for film distributors. Give it a film, a few comparable titles and a release window. It uses **Qloo's taste graph** to:
- score every film releasing in that window for **how much of your audience it competes for**
- find big releases with a **different crowd** that you can open against, Barbenheimer-style
- rank the US markets where your audience concentrates

The output is a release plan where every date, rival and number traces back to a Qloo call.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com).

## The problem

Choosing an opening weekend is a multi-million-dollar bet. Two films that share an audience split it, and a film opening against a blockbuster with a *different* audience can thrive. Big studios pay for tracking surveys that measure awareness, but awareness isn't audience overlap. Independent distributors and streaming slate teams mostly decide on instinct. An LLM alone can't help either: it doesn't know which films are actually releasing, or whose audiences overlap.

## How it works

A Gemini agent (function calling: `gemini-3.5-flash`, with `gemini-3.5-flash-lite` as fallback) plans its own investigation: it resolves the comps, profiles the audience, scans the calendar, **shortlists and tests 2–3 candidate Fridays**, compares crowds with the releases it cares about, then submits a plan. **A server-side self-check sends the plan back** if it contradicts Qloo's numbers (e.g. picks a much riskier Friday than a safer one without a stated trade-off), and a fact-check removes anything Qloo didn't return. Both show up in the agent log.

| Tool | Qloo call(s) | What it answers |
|---|---|---|
| `resolve_titles` | `GET /search` (`types=urn:entity:movie`) | Which Qloo entities are the comps (and is the film itself already in Qloo)? |
| `profile_audience` | `GET /v2/insights` `filter.type=urn:demographics`, `signal.interests.entities=<comps>`, plus the comps' Qloo taste tags | Who the audience is: age and gender affinity, taste |
| `scan_calendar` | `GET /v2/insights` `filter.type=urn:entity:movie` paged by `filter.release_year` (Qloo includes announced 2026–2029 releases), filtered to exact dates; restricted to US/UK/Canada/Australia releases (`filter.release_country`); then **`GET /v2/analysis/compare`** (`a.signal.interests.entities=<comps>`, `b.signal.interests.entities=<film>`) for up to 32 releases chosen by size and by a free pre-screen on the taste tags Qloo attaches to each film (top two of every week guaranteed) | Every release in the window, and how much taste each one shares with your audience |
| `test_weekend` | (uses calendar + `compare_rival`) | Deep-dive on one candidate Friday: its risk and rank, and whether the releases within two weeks are the same crowd |
| `compare_rival` | `urn:demographics` for the rival, combined with the compare result | Same crowd or different crowd? (the Barbenheimer test) |
| `rank_markets` | `GET /v2/insights` `filter.type=urn:heatmap` over the continental US | Where the audience concentrates, averaged around 18 US theatrical markets |
| `find_channels` | `GET /v2/insights` `filter.type=urn:entity:tv_show`, `filter.popularity.max=0.97` so universally popular shows drop out | Where to place trailers and pitch press. (We tested podcasts too; for film audiences Qloo returned generic YouTuber podcasts, so we left them out.) |
| `submit_plan` | (none) | Recommended Friday, alternates, weekends to avoid, a counterprogramming target, markets and marketing. Self-checked against the numbers; **any date, rival or entity not returned by Qloo is dropped and listed in the UI.** |

### Scoring (pure code, reproducible: `src/lib/agent.ts`)
- **Audience overlap** = the taste tags Qloo's compare finds your comps and a release share, weighted like TF-IDF. A tag most releases share ("Action", "Hero's Journey") counts little, and a rare one ("Biography", "Gritty") counts a lot. The result is normalized to the window.
- **Threat** of a release = overlap × (0.35 + 0.65 × size), where size is Qloo popularity.
- **Weekend risk** = 1 − ∏(1 − threat × weight). Weight is 1 for films opening that weekend, 0.5 for one-week holdovers and 0.2 for two-week holdovers. The scan starts 17 days before the window so early holdovers count.
- **Crowd similarity** = 0.8 × overlap + 0.2 × demographic cosine (age buckets + gender) when Qloo has demographics for both, otherwise overlap alone (unreleased films often have none yet). ≥ 0.55 is "Same crowd", < 0.33 is "Different crowd".

### What we learned from the live API (and designed around)
- `filter.release_date.min/max` is ignored on the hackathon host, so we page `filter.release_year` and filter dates ourselves.
- Signal-ranked insights return only a handful of unreleased films (thin taste data before release), so overlap comes from `/v2/analysis/compare` instead.
- Compare's per-tag `score` is near-constant; the *set* of shared tags is the signal, so we weight it by rarity.

## Pages

| Route | What it is |
|---|---|
| `/` | Landing page in three reels: what it is, a replay of how the agent thinks, and an example result |
| `/agent` | The agent console: describe your film, watch the agent work, read the release plan. `/agent?preset=horror` pre-fills an example |
| `/api/plan` | Streams the agent's events as NDJSON (rate-limited, identical briefs replay from a 30-minute cache) |
| `/api/posters` | Upcoming-release posters for the landing film strip (one Qloo call, cached 6 hours in server memory) |

The example result and the replayed terminal on the landing page are short illustrative snippets copied by hand from one real run; no Qloo response data is stored in this repo.

## Try it

The hosted demo has three forward-looking samples (awards drama, indie horror, animated family) and two **illustrative replays** from 2023: *Oppenheimer* vs *Barbie*, and *Dungeons & Dragons* one week before *The Super Mario Bros. Movie*. Replays use today's Qloo data, which already reflects how those films performed, so they show the method and are not a backtest.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add QLOO_API_KEY and GEMINI_API_KEY
npm run dev
```

Both keys are optional for local development:
- Without `QLOO_API_KEY`, the client returns clearly labeled mock data with the same shapes as the real API.
- Without `GEMINI_API_KEY`, a scripted agent runs the same tools in a fixed order.

The deployed demo runs both live.

## Data handling

- No personal data is collected or sent to Qloo.
- Qloo responses are cached in server memory only and never committed to this repo.
- The Qloo key stays on the server.
- Qloo affinities describe aggregate audiences, not individuals.

## Limitations

- Audience overlap is one input. Screen counts, marketing spend, reviews and holidays also drive openings.
- Upcoming films have thinner taste data before release, and Qloo knows fewer releases the further out you go (about 265 US-market films for 2027, 42 for 2028). The plan flags sparse windows and lowers its confidence.
- The heatmap rollup averages cells within ~0.6° of each market center, a planning heuristic.
- On live data the Oppenheimer replay recommends July 28, 2023 (34% overlap risk) over the actual July 21 (76%), while naming *Barbie* as the counterprogramming target. We show this as it is rather than tuning for the famous answer.

## Stack

Next.js 16 · TypeScript · Tailwind · `@google/genai` (Gemini function calling) · Leaflet + OpenStreetMap · Qloo Hackathon API (`https://hackathon.api.qloo.com`).

## License

MIT
