"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FilmStrip from "@/components/FilmStrip";
import Poster from "@/components/Poster";
import SiteHeader from "@/components/SiteHeader";
import { Scramble, Typed } from "@/components/Fx";
import { SAMPLES, type Sample } from "@/lib/samples";
import type { AgentEvent, Channels, Market, Plan, Rival, TasteTag, Threat, Weekend } from "@/lib/agent";
import type { Demographics, Entity, Movie, QlooCall } from "@/lib/qloo";

const MarketsMap = dynamic(() => import("@/components/MarketsMap"), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse bg-raised" />,
});

/* ------------------------------------------------------------------ helpers */

type Step =
  | { kind: "step"; text: string; tone?: "think" | "check" }
  | { kind: "call"; call: QlooCall }
  | { kind: "error"; text: string };

type State = {
  film: Movie | null;
  comps: Movie[];
  rejected: string[];
  demo: Demographics | null;
  tags: TasteTag[];
  weekends: Weekend[];
  films: Threat[];
  rivals: Rival[];
  markets: Market[];
  channels: Channels | null;
  plan: Plan | null;
  baseline: string | null;
};

const EMPTY: State = { film: null, comps: [], rejected: [], demo: null, tags: [], weekends: [], films: [], rivals: [], markets: [], channels: null, plan: null, baseline: null };

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

const bigDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  const wd = d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
  const mo = d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" });
  return `${wd} ${String(d.getUTCDate()).padStart(2, "0")} ${mo} ${d.getUTCFullYear()}`.toUpperCase();
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mmss = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

const SIGNAL = "#f0ed12";
const ALERT = "#ff4b2b";
const WARN = "#ff9f1c";
const BUSY = "#b7b41e";

function riskColor(r: number) {
  if (r >= 0.55) return ALERT;
  if (r >= 0.35) return WARN;
  if (r >= 0.18) return BUSY;
  return SIGNAL;
}

const riskWord = (r: number) => (r >= 0.55 ? "Crowded" : r >= 0.35 ? "Contested" : r >= 0.18 ? "Busy" : "Clear");

const sizeWord = (x: number) => (x >= 0.75 ? "Blockbuster" : x >= 0.4 ? "Mid-size" : "Smaller release");

const VERDICT: Record<Rival["verdict"], { label: string; cls: string }> = {
  "Same crowd": { label: "Same audience as yours", cls: "border-alert/60 bg-alert/10 text-alert" },
  "Partial overlap": { label: "Some overlap", cls: "border-warn/60 bg-warn/10 text-warn" },
  "Different crowd": { label: "Different audience", cls: "border-signal/60 bg-signal/10 text-signal" },
};

const BLANK = { title: "", logline: "", comps: "", start: "", end: "" };
const fromSample = (x: Sample) => ({ title: x.title, logline: x.logline, comps: x.comps.join("; "), start: x.start, end: x.end });

/* ------------------------------------------------------------------ page */

export default function AgentConsole({ initialPreset }: { initialPreset?: string }) {
  const preset = SAMPLES.find((x) => x.key === initialPreset);
  const [form, setForm] = useState(() => (preset ? fromSample(preset) : BLANK));
  const [replay, setReplay] = useState<string | null>(preset?.replay ?? null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [s, setS] = useState<State>(EMPTY);
  const [meta, setMeta] = useState<{ qlooLive: boolean; llm: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [logOpen, setLogOpen] = useState(true);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  function load(x: Sample) {
    setForm(fromSample(x));
    setReplay(x.replay ?? null);
  }

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setRunning(true);
    setElapsed(0);
    setSteps([]);
    setS(EMPTY);
    setError(null);
    setLogOpen(true);
    setTimeout(() => anchor.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, comps: form.comps.split(/;|\n|,(?=\s*[A-Z])/).map((c) => c.trim()).filter(Boolean) }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) if (l.trim()) handle(JSON.parse(l) as AgentEvent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  function handle(ev: AgentEvent) {
    switch (ev.type) {
      case "meta":
        return setMeta({ qlooLive: ev.qlooLive, llm: ev.llm });
      case "step":
        return setSteps((x) => [...x, { kind: "step", text: ev.text, tone: ev.kind }]);
      case "error":
        return setSteps((x) => [...x, { kind: "error", text: ev.text }]);
      case "call":
        return setSteps((x) => [...x, { kind: "call", call: ev.call }]);
      case "resolved":
        return setS((x) => ({ ...x, film: ev.film, comps: ev.comps, rejected: ev.rejected ?? [] }));
      case "profile":
        return setS((x) => ({ ...x, demo: ev.demo, tags: ev.tags }));
      case "calendar":
        return setS((x) => ({ ...x, weekends: ev.weekends, films: ev.films }));
      case "rival":
        return setS((x) => ({ ...x, rivals: [...x.rivals.filter((r) => r.rival.id !== ev.rival.rival.id), ev.rival] }));
      case "markets":
        return setS((x) => ({ ...x, markets: ev.markets }));
      case "channels":
        return setS((x) => ({ ...x, channels: ev.channels }));
      case "plan":
        setLogOpen(false);
        return setS((x) => ({ ...x, plan: ev.plan }));
      case "baseline":
        return setS((x) => ({ ...x, baseline: ev.text }));
    }
  }

  const started = running || steps.length > 0;
  const ready = form.title && form.comps && form.start && form.end;
  const past = !!form.start && form.start < new Date().toISOString().slice(0, 10);
  const calls = steps.filter((x) => x.kind === "call").length;

  return (
    <div className="min-h-screen">
      <SiteHeader variant="agent" />

      <main className="relative">
        {/* ================= THE BRIEF ================= */}
        <section className="no-print relative overflow-hidden border-b border-line">
          <div className="hud-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_20%_10%,#000,transparent_75%)]" />
          <div className="beam pointer-events-none absolute right-0 top-0 h-full w-3/4 opacity-80" />

          <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="mb-4 flex items-center gap-3 text-sm font-medium uppercase tracking-[0.2em] text-signal">
                <span className="inline-block h-px w-10 bg-signal" />
                The screening room
              </p>
              <h1 className="font-display text-[clamp(2.4rem,5vw,4.2rem)] font-bold uppercase leading-[0.95] tracking-tight">
                Analyze
                <br />
                <span className="text-signal">
                  your release<span className="animate-blink">_</span>
                </span>
              </h1>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-ink/90">
                Tell the agent about your movie. In about 30 seconds you get <b className="text-signal">the best opening Friday</b>, <b className="text-signal">which weekends to avoid</b>,{" "}
                <b className="text-signal">a big release to open against</b> and <b className="text-signal">the cities to start in</b>.
              </p>

              <p className="mb-2 mt-7 text-sm font-medium text-muted">Not sure what to type? Try an example:</p>
              <ul className="max-w-md space-y-1.5">
                {SAMPLES.map((x) => (
                  <li key={x.key}>
                    <button
                      type="button"
                      onClick={() => load(x)}
                      className={`group flex w-full items-center justify-between gap-3 border px-3 py-2.5 text-left transition hover:border-signal ${
                        x.replay ? "border-dashed border-faint" : "border-line"
                      } ${form.title === x.title ? "border-signal bg-signal-soft/40" : ""}`}
                    >
                      <span>
                        <span className="block font-display text-base font-semibold uppercase tracking-wide group-hover:text-signal">{x.title.split(":")[0]}</span>
                        <span className="block text-xs text-muted">{x.tag}</span>
                      </span>
                      <span className="text-sm text-faint group-hover:text-signal">Use →</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Link href="/#method" className="mt-5 inline-block text-sm text-muted underline underline-offset-4 hover:text-signal">
                How does the agent work? →
              </Link>
            </div>

            <form onSubmit={run} className="cut relative self-start border border-line bg-surface/95 p-6 backdrop-blur">
              <p className="mb-4 font-display text-xl font-bold uppercase tracking-wide text-signal">Your film</p>
              <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Working title" />
              <Field label="What it's about (one sentence)" value={form.logline} onChange={(v) => setForm({ ...form, logline: v })} placeholder="A night-shift nurse realizes…" textarea />
              <Field
                label="Three similar films your audience loved"
                hint='Separate with ;  These "comps" tell the agent who your audience is.'
                value={form.comps}
                onChange={(v) => setForm({ ...form, comps: v })}
                placeholder="Hereditary; Talk to Me; The Witch"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Earliest release date" type="date" value={form.start} onChange={(v) => setForm({ ...form, start: v })} />
                <Field label="Latest release date" type="date" value={form.end} onChange={(v) => setForm({ ...form, end: v })} />
              </div>
              {replay && <p className="mb-3 border border-dashed border-line px-3 py-2 text-sm leading-snug text-muted">{replay}</p>}
              <button
                disabled={running || !ready}
                className="cut w-full bg-signal px-4 py-3.5 font-display text-lg font-bold uppercase tracking-[0.15em] text-black transition hover:brightness-110 disabled:opacity-30"
              >
                {running ? `Analyzing… ${mmss(elapsed)}` : "▶ Analyze my release"}
              </button>
              <p className="mt-2 text-center text-sm text-faint">Takes about 30 seconds · no sign-up</p>
            </form>
          </div>
          <FilmStrip caption="Upcoming releases the agent can compare against" />
        </section>

        {/* ================= RESULTS ================= */}
        <div ref={anchor} className="scroll-mt-16" />
        <section className="mx-auto max-w-7xl px-4 pb-24 pt-8">
          <PhaseTracker s={s} steps={steps} running={running} idle={!started} />
          {!started && (
            <div className="mt-6 border border-dashed border-line p-10 text-center">
              <p className="font-display text-xl font-bold uppercase tracking-wide text-muted">Your analysis will appear here</p>
              <p className="mx-auto mt-2 max-w-lg text-base text-muted">
                Pick an example or describe your film, then press <b className="text-ink">Analyze my release</b>.
              </p>
            </div>
          )}
          {started && (
            <div className="mt-6">
              <button onClick={() => setLogOpen((o) => !o)} className="no-print mb-4 border border-line px-3 py-1.5 text-sm text-muted transition hover:border-signal hover:text-signal">
                {logOpen ? "▾ Hide" : "▸ Show"} what the agent did ({calls} Qloo lookups)
              </button>
              <div className={logOpen ? "grid gap-6 lg:grid-cols-[340px_1fr]" : ""}>
                {logOpen && <AgentLog steps={steps} running={running} meta={meta} elapsed={elapsed} />}
                <div className="min-w-0 space-y-6">
                  {error && <div className="border border-alert/50 bg-alert/10 p-4 text-base text-alert">{error}</div>}
                  {s.rejected.length > 0 && (
                    <div className="border border-warn/50 bg-warn/10 p-4 text-base">
                      <b className="text-warn">Not found in Qloo:</b> {s.rejected.join(", ")}. Qloo&apos;s closest match was a different film, so the agent left {s.rejected.length === 1 ? "it" : "them"} out
                      {s.comps.length ? ` and used ${s.comps.map((c) => c.name).join(", ")}.` : ". Check the spelling or try better-known titles."}
                    </div>
                  )}
                  {s.plan ? <PlanHero plan={s.plan} s={s} title={form.title} /> : running && <ScanSkeleton />}
                  {s.weekends.length > 0 && <Calendar s={s} />}
                  {s.films.length > 0 && <Threats s={s} />}
                  {s.rivals.length > 0 && <Crowds s={s} />}
                  {s.comps.length > 0 && (s.demo || s.tags.length > 0) && <Audience demo={s.demo} tags={s.tags} comps={s.comps} />}
                  {s.markets.length > 0 && <Markets markets={s.markets} picked={s.plan?.opening_markets ?? s.markets.slice(0, 5).map((m) => m.name)} />}
                  {s.channels && <ChannelsCard channels={s.channels} plan={s.plan} />}
                  {(s.plan || s.baseline) && <Compare s={s} past={past} />}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="no-print border-t border-line px-4 py-6 text-center text-xs leading-relaxed text-faint">
        Qloo describes aggregate audiences, not individuals. Audience overlap is one input beside screens, marketing spend and reviews. Film imagery via Qloo.
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ building blocks */

function Field(props: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean; type?: string }) {
  const cls = "w-full border border-line bg-black/40 px-3 py-2.5 text-base text-ink outline-none transition placeholder:text-faint focus:border-signal focus:bg-black/60";
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-sm font-medium text-ink/90">{props.label}</span>
      {props.hint && <span className="mb-1 block text-xs text-faint">{props.hint}</span>}
      {props.textarea ? (
        <textarea rows={2} className={cls} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input type={props.type ?? "text"} className={cls} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
      )}
    </label>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="animate-reveal break-inside-avoid border border-line bg-surface p-5 md:p-6">
      <h3 className="font-display text-2xl font-bold uppercase tracking-wide">{title}</h3>
      {sub && <p className="mb-5 mt-1 max-w-3xl text-base leading-snug text-muted">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Meter({ value, color }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full bg-raised">
      <div className="h-2" style={{ width: pct(Math.min(1, value)), background: color ?? riskColor(value * 0.75) }} />
    </div>
  );
}

function VerdictPill({ v }: { v: Rival["verdict"] }) {
  const x = VERDICT[v];
  return <span className={`whitespace-nowrap border px-2.5 py-0.5 text-xs font-semibold ${x.cls}`}>{x.label}</span>;
}

/* ------------------------------------------------------------------ agent activity */

const PHASES = ["Casting", "Audience", "The slate", "Screen test", "Second take", "Premiere"];

function PhaseTracker({ s, steps, running, idle = false }: { s: State; steps: Step[]; running: boolean; idle?: boolean }) {
  const done = [
    s.comps.length > 0 || s.rejected.length > 0,
    !!s.demo || s.tags.length > 0,
    s.weekends.length > 0,
    s.rivals.length > 0 || steps.some((x) => x.kind === "step" && x.text.startsWith("Testing")),
    !!s.plan || steps.some((x) => x.kind === "step" && x.tone === "check"),
    !!s.plan,
  ];
  const current = done.findIndex((d) => !d);
  return (
    <div className="no-print border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium text-muted">What the agent does</span>
        <span className={idle ? "text-faint" : running || done[5] ? "text-signal" : "text-alert"}>{idle ? "Ready" : running ? "● Working…" : done[5] ? "● Done" : "● Stopped"}</span>
      </div>
      <ol className="flex items-center">
        {PHASES.map((p, i) => {
          const isDone = done[i];
          const isNow = running && i === current;
          return (
            <li key={p} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center border text-xs font-bold transition ${
                    isDone ? "border-signal bg-signal text-black" : isNow ? "animate-blink border-signal text-signal" : "border-line text-faint"
                  }`}
                >
                  {isDone ? "✓" : i + 1}
                </span>
                <span className={`hidden text-sm md:inline ${isDone || isNow ? "font-medium text-ink" : "text-faint"}`}>{p}</span>
              </div>
              {i < PHASES.length - 1 && <span className={`mx-2 h-px flex-1 ${isDone ? "bg-signal" : "bg-line"}`} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AgentLog({ steps, running, meta, elapsed }: { steps: Step[]; running: boolean; meta: { qlooLive: boolean; llm: string } | null; elapsed: number }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [steps.length]);
  return (
    <aside className="no-print h-fit border border-line bg-black/70 lg:sticky lg:top-20">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-signal">
          <span className={`h-2 w-2 rounded-full bg-signal ${running ? "animate-blink" : ""}`} /> Agent activity
        </span>
        <span className="font-mono text-xs text-faint">{mmss(elapsed)}</span>
      </div>
      <div className="relative px-3 pb-3 pt-2">
        {running && <div className="animate-scanline pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-transparent via-signal/10 to-transparent" />}
        <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
          {meta && (
            <>
              <span className={`border px-1.5 py-0.5 ${meta.qlooLive ? "border-signal/60 text-signal" : "border-warn/60 text-warn"}`}>Qloo data: {meta.qlooLive ? "live" : "sample"}</span>
              <span className="border border-line px-1.5 py-0.5 text-muted">AI: {meta.llm}</span>
            </>
          )}
        </div>
        <ol ref={box} className="max-h-[60vh] space-y-1.5 overflow-auto pr-1 font-mono text-[12.5px] leading-snug">
          {steps.map((x, i) =>
            x.kind === "step" ? (
              <li key={i} className={x.tone === "think" ? "border-l border-line pl-2 italic text-muted" : x.tone === "check" ? "border border-signal/60 bg-signal-soft px-2 py-1 text-signal" : "text-ink"}>
                {x.tone === "think" ? "💭 " : x.tone === "check" ? "✓ " : "› "}
                <Typed text={x.text} />
              </li>
            ) : x.kind === "error" ? (
              <li key={i} className="border border-alert/50 bg-alert/10 px-2 py-1 text-alert">
                ⚠ {x.text}
              </li>
            ) : (
              <li key={i}>
                <details className={`border px-2 py-1 ${x.call.error ? "border-alert/50" : "border-line"}`}>
                  <summary className="cursor-pointer text-[11px] text-faint hover:text-ink">
                    Qloo · {x.call.endpoint} · {x.call.error ? "error" : `${x.call.count} results`} · {x.call.ms}ms
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-faint">
                    {Object.entries(x.call.params)
                      .map(([k, v]) => `${k}=${v}`)
                      .join("\n")}
                    {x.call.error ? `\n${x.call.error}` : ""}
                  </pre>
                </details>
              </li>
            ),
          )}
          {running && <li className="text-signal">› <span className="animate-blink">▌</span></li>}
        </ol>
      </div>
    </aside>
  );
}

function ScanSkeleton() {
  return (
    <div className="relative h-56 overflow-hidden border border-line bg-surface">
      <div className="hud-grid absolute inset-0 opacity-50" />
      <div className="animate-scanline absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-signal/15 to-transparent" />
      <div className="absolute inset-0 grid place-items-center">
        <span className="animate-flicker font-display text-xl font-bold uppercase tracking-[0.2em] text-signal">Reading the release slate…</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ results */

function PlanHero({ plan, s, title }: { plan: Plan; s: State; title: string }) {
  const wk = s.weekends.find((w) => w.friday === plan.recommended_friday);
  const byId = new Map(s.films.map((f) => [f.id, f]));
  const cp = plan.counterprogram ? byId.get(plan.counterprogram.rival_id) : undefined;
  return (
    <section className="animate-reveal relative overflow-hidden border border-signal/50 bg-surface p-6 md:p-8">
      <div className="hud-grid absolute inset-0 opacity-40 [mask-image:linear-gradient(110deg,#000,transparent_70%)]" />
      <div className="relative">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted">
          Best opening weekend for <span className="text-ink">{title}</span>
        </p>
        <p className="mt-2 font-display text-[clamp(2.6rem,7.5vw,5.6rem)] font-bold leading-[0.95] tracking-tight text-signal">
          {plan.recommended_friday ? <Scramble key={plan.recommended_friday} text={bigDate(plan.recommended_friday)} /> : "NO CLEAR WEEKEND"}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {wk && (
            <span className="px-3 py-1 font-bold text-black" style={{ background: riskColor(wk.risk) }}>
              {riskWord(wk.risk)} run · {pct(wk.risk)} competition for your audience
            </span>
          )}
          <span className="border border-line px-3 py-1 text-muted">{plan.confidence[0].toUpperCase() + plan.confidence.slice(1)} confidence</span>
          <button onClick={() => window.print()} className="no-print border border-line px-3 py-1 text-ink transition hover:border-signal hover:text-signal">
            ⤓ Save as PDF
          </button>
        </div>
        <p className="mt-5 max-w-3xl font-display text-xl font-semibold leading-snug">{plan.headline}</p>
        <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted">{plan.rationale}</p>

        <div className="mt-7 grid gap-6 md:grid-cols-3">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink">Backup dates</h4>
            <div className="flex flex-wrap gap-2">
              {plan.alternates.length ? (
                plan.alternates.map((d) => (
                  <span key={d} className="border border-signal/50 px-3 py-1 text-base font-medium text-signal">
                    {fmt(d, { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                ))
              ) : (
                <span className="text-sm text-faint">No other Friday comes close.</span>
              )}
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink">Weekends to avoid</h4>
            <ul className="space-y-2.5">
              {plan.avoid.map((a) => {
                const f = byId.get(a.rival_id);
                return (
                  <li key={a.friday + a.rival_id} className="flex items-start gap-2.5">
                    {f && <Poster src={f.image} title={f.name} tone="alert" className="w-10 shrink-0" />}
                    <p className="text-sm leading-snug">
                      <b className="text-alert">{fmt(a.friday, { month: "short", day: "numeric" })}</b> · <b>{f?.name ?? "A rival film"}</b>
                      <span className="block text-muted">{a.reason}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink">A big film you can open near</h4>
            {plan.counterprogram && cp ? (
              <div className="flex items-start gap-2.5">
                <Poster src={cp.image} title={cp.name} tone="signal" className="w-10 shrink-0" />
                <p className="text-sm leading-snug">
                  <b className="text-signal">{cp.name}</b>
                  <span className="block text-muted">{plan.counterprogram.reason}</span>
                </p>
              </div>
            ) : (
              <span className="text-sm text-faint">No strong candidate in this window.</span>
            )}
          </div>
        </div>

        {plan.risks.length > 0 && (
          <div className="mt-7 border-t border-line pt-4">
            <h4 className="mb-2 text-sm font-semibold text-ink">Things to keep in mind</h4>
            <ul className="space-y-1 text-sm text-muted">
              {plan.risks.slice(0, 4).map((r) => (
                <li key={r}>⚠ {r}</li>
              ))}
            </ul>
          </div>
        )}
        {plan.dropped.length > 0 && (
          <details className="mt-3 text-sm text-faint">
            <summary className="cursor-pointer hover:text-ink">{plan.dropped.length} agent suggestion(s) were removed because Qloo&apos;s data didn&apos;t back them</summary>
            <ul className="mt-1 list-disc pl-5">
              {plan.dropped.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function Calendar({ s }: { s: State }) {
  const [sel, setSel] = useState<string | null>(null);
  const byId = useMemo(() => new Map(s.films.map((f) => [f.id, f])), [s.films]);
  const rec = s.plan?.recommended_friday;
  const avoid = new Set(s.plan?.avoid.map((a) => a.friday));
  const active = s.weekends.find((w) => w.friday === (sel ?? rec)) ?? s.weekends[0];
  return (
    <Panel
      title="Every Friday in your window"
      sub={
        <>
          Each bar is a possible opening Friday. <b className="text-ink">The taller and redder the bar, the more other films are competing for your audience</b> that weekend (new releases plus films still
          in theaters). Click a bar to see who.
        </>
      }
    >
      <div className="relative flex h-56 items-end gap-1.5 pb-7 pl-9">
        {[100, 75, 50, 25, 0].map((t) => (
          <div key={t} className="pointer-events-none absolute inset-x-0 flex items-center gap-2 text-[11px] text-faint" style={{ bottom: `calc(1.75rem + ${t} * (100% - 1.75rem) / 100)` }}>
            <span className="w-7 text-right">{t}%</span>
            <span className="h-px flex-1 bg-line/70" />
          </div>
        ))}
        {s.weekends.map((w, i) => {
          const isRec = w.friday === rec;
          return (
            <button key={w.friday} onClick={() => setSel(w.friday)} className="group relative z-10 flex h-full min-w-[24px] flex-1 flex-col items-center justify-end" title={`${fmt(w.friday)} · ${pct(w.risk)} competition`}>
              {isRec && <span className="absolute -top-1 z-10 text-xl leading-none text-signal">★</span>}
              {avoid.has(w.friday) && <span className="absolute -top-1 z-10 text-base font-bold leading-none text-alert">✕</span>}
              <div className="flex h-[calc(100%-1.75rem)] w-full items-end">
                <div
                  className={`animate-grow w-full transition group-hover:brightness-125 ${w.friday === active?.friday ? "outline outline-2 outline-offset-1 outline-ink" : ""}`}
                  style={{ height: `${Math.max(5, w.risk * 100)}%`, animationDelay: `${i * 45}ms`, backgroundColor: riskColor(w.risk) }}
                />
              </div>
              <span className={`mt-1.5 h-5 text-[11px] ${isRec ? "font-bold text-signal" : "text-muted"}`}>{fmt(w.friday)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {[
          ["Clear", SIGNAL],
          ["Busy", BUSY],
          ["Contested", WARN],
          ["Crowded", ALERT],
        ].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5" style={{ background: c }} />
            {l}
          </span>
        ))}
        <span>★ recommended</span>
        <span>✕ avoid</span>
      </div>
      {active && (
        <div className="mt-5 border border-line bg-black/30 p-4">
          <p className="font-display text-xl font-bold uppercase tracking-wide">
            {fmt(active.friday, { weekday: "long", month: "long", day: "numeric" })} ·{" "}
            <span style={{ color: riskColor(active.risk) }}>
              {riskWord(active.risk)}, {pct(active.risk)} competition
            </span>
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-semibold">Opening that weekend</h4>
              <FilmList ids={active.opening} byId={byId} empty="Nothing that shares your audience." />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Still in theaters from earlier weeks</h4>
              <FilmList ids={active.holdover} byId={byId} empty="Nothing that shares your audience." />
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

// Only films that actually share the audience; the rest are summarised as a count.
function FilmList({ ids, byId, empty }: { ids: string[]; byId: Map<string, Threat>; empty: string }) {
  const films = ids.map((id) => byId.get(id)).filter((f): f is Threat => !!f).sort((a, b) => b.overlap - a.overlap);
  const shown = films.filter((f) => f.overlap >= 0.15).slice(0, 4);
  const rest = films.length - shown.length;
  if (!shown.length) return <p className="text-sm text-faint">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {shown.map((f) => (
        <li key={f.id} className="flex items-center gap-3">
          <Poster src={f.image} title={f.name} className="w-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium">{f.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1">
                <Meter value={f.overlap} />
              </div>
              <span className="w-24 text-xs text-muted">{pct(f.overlap)} shared audience</span>
            </div>
          </div>
        </li>
      ))}
      {rest > 0 && (
        <li className="text-sm text-faint">
          +{rest} other release{rest > 1 ? "s" : ""} with little or no shared audience
        </li>
      )}
    </ul>
  );
}

function Threats({ s }: { s: State }) {
  // Head-to-head verdicts where the agent ran one; otherwise the same thresholds applied to the overlap alone.
  const compared = new Map(s.rivals.map((r) => [r.rival.id, r.verdict]));
  const verdictFor = (f: Threat): Rival["verdict"] => compared.get(f.id) ?? (f.overlap >= 0.55 ? "Same crowd" : f.overlap >= 0.33 ? "Partial overlap" : "Different crowd");
  return (
    <Panel
      title="Who you're up against"
      sub={
        <>
          The biggest threats in your window. <b className="text-ink">Shared audience</b> is how much taste Qloo finds your audience has in common with that film&apos;s audience. A big film with a high shared audience is the
          most dangerous.
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead className="text-sm text-muted">
            <tr className="border-b border-line">
              <th className="pb-2 font-medium">Film</th>
              <th className="pb-2 font-medium">Opens</th>
              <th className="pb-2 font-medium">Shared audience</th>
              <th className="pb-2 font-medium">Size</th>
              <th className="pb-2 font-medium">What you have in common</th>
              <th className="pb-2 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {s.films.slice(0, 10).map((f) => (
              <tr key={f.id} className="border-b border-line/60">
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-3">
                    <Poster src={f.image} title={f.name} className="w-9 shrink-0" />
                    <span className="text-base font-semibold">{f.name}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-base text-muted">{f.releaseDate ? fmt(f.releaseDate) : "—"}</td>
                <td className="w-44 py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Meter value={f.overlap} />
                    </div>
                    <span className="w-10 text-sm font-semibold">{pct(f.overlap)}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-sm text-muted">{sizeWord(f.size)}</td>
                <td className="max-w-[220px] py-2.5 pr-3 text-sm text-muted">{f.shared.length ? f.shared.slice(0, 3).join(", ") : "—"}</td>
                <td className="py-2.5">
                  <VerdictPill v={verdictFor(f)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const AGE_LABELS: [string, string][] = [
  ["24_and_younger", "Under 25"],
  ["25_to_29", "25–29"],
  ["30_to_34", "30–34"],
  ["35_to_44", "35–44"],
  ["45_to_54", "45–54"],
  ["55_and_older", "55+"],
];

function AgeBars({ a, b, bName }: { a: Demographics; b?: Demographics; bName?: string }) {
  return (
    <div>
      <div className="space-y-1.5">
        {AGE_LABELS.map(([k, l]) => (
          <div key={k} className="grid grid-cols-[62px_1fr] items-center gap-2 text-xs text-muted">
            <span>{l}</span>
            <div className="space-y-0.5">
              <Bar v={a.age[k] ?? 0} color={SIGNAL} />
              {b && <Bar v={b.age[k] ?? 0} color="#9a9a90" />}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        <span className="text-signal">■</span> Your audience {b && bName && (
          <>
            <span className="ml-3 text-ink/70">■</span> {bName}
          </>
        )}
        <span className="ml-3 text-faint">(right of the line = over-represented)</span>
      </p>
    </div>
  );
}

function Bar({ v, color }: { v: number; color: string }) {
  const w = Math.min(50, Math.abs(v) * 50);
  return (
    <div className="relative h-2 bg-raised">
      <div className="absolute top-0 h-2 w-px bg-faint" style={{ left: "50%" }} />
      <div className="absolute top-0 h-2" style={{ background: color, width: `${w}%`, left: v >= 0 ? "50%" : `${50 - w}%`, opacity: v >= 0 ? 1 : 0.4 }} />
    </div>
  );
}

function Crowds({ s }: { s: State }) {
  const cp = s.plan?.counterprogram?.rival_id;
  const anyDemo = s.rivals.some((r) => r.ours && r.theirs);
  return (
    <Panel
      title="Same audience, or a different one?"
      sub={
        <>
          The Barbenheimer test. <b className="text-signal">Different audience</b> means you can open against it even if it&apos;s huge. <b className="text-alert">Same audience</b> means you&apos;d split the crowd.
          {!anyDemo && <span className="mt-1 block text-sm text-faint">Qloo has no age or gender data for these unreleased films yet, so each verdict rests on shared taste alone.</span>}
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {s.rivals.map((r) => (
          <div key={r.rival.id} className={`flex gap-4 border p-4 ${r.rival.id === cp ? "border-signal/70 bg-signal-soft/40" : "border-line bg-black/20"}`}>
            <Poster src={r.rival.image} title={r.rival.name} tone={r.verdict === "Same crowd" ? "alert" : "ink"} className="w-20 shrink-0 self-start" />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-xl font-bold leading-tight">{r.rival.name}</p>
                  <p className="text-sm text-muted">
                    Opens {r.rival.releaseDate ? fmt(r.rival.releaseDate) : "—"} · {pct(r.similarity)} similar audience
                  </p>
                </div>
                <VerdictPill v={r.verdict} />
              </div>
              {r.ours && r.theirs ? <AgeBars a={r.ours} b={r.theirs} bName={r.rival.name} /> : null}
              <div className="mt-3 space-y-1 text-sm">
                {r.shared.length > 0 && (
                  <p>
                    <span className="text-muted">Both audiences like:</span> <span className="font-medium text-alert">{r.shared.slice(0, 5).join(", ")}</span>
                  </p>
                )}
                {r.onlyOurs.length > 0 && (
                  <p>
                    <span className="text-muted">Only yours:</span> <span className="font-medium text-signal">{r.onlyOurs.slice(0, 4).join(", ")}</span>
                  </p>
                )}
                {r.onlyTheirs.length > 0 && (
                  <p>
                    <span className="text-muted">Only theirs:</span> <span className="font-medium">{r.onlyTheirs.slice(0, 4).join(", ")}</span>
                  </p>
                )}
              </div>
              {r.rival.id === cp && <p className="mt-2 text-sm font-bold text-signal">★ The agent&apos;s pick to open near</p>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Audience({ demo, tags, comps }: { demo: Demographics | null; tags: TasteTag[]; comps: Movie[] }) {
  return (
    <Panel title="Who your audience is" sub="Learned from the people who love your comps (the similar films you gave the agent).">
      <div className="flex flex-wrap gap-4">
        {comps.map((c) => (
          <div key={c.id} className="w-24">
            <Poster src={c.image} title={c.name} tone="signal" />
            <p className="mt-1.5 text-xs font-medium leading-tight">
              {c.name}
              {c.year ? <span className="text-muted"> ({c.year})</span> : null}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Age</h4>
          {demo ? (
            <>
              <AgeBars a={demo} />
              <p className="mt-3 text-sm text-muted">
                Gender:{" "}
                {Object.entries(demo.gender)
                  .map(([k, v]) => `${v >= 0.03 ? "leans " : v <= -0.03 ? "under-indexes " : "about even "}${k}`)
                  .join(" · ") || "—"}
              </p>
            </>
          ) : (
            <p className="text-sm text-faint">Qloo has no age/gender data for these comps.</p>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">What they respond to</h4>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 14).map((t) => (
              <span key={t.name} className="border border-line px-2.5 py-1 text-sm" style={{ opacity: 0.6 + t.weight * 0.4 }}>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Markets({ markets, picked }: { markets: Market[]; picked: string[] }) {
  return (
    <Panel title="Where to open first" sub="The US cities where your audience is most concentrated, from Qloo's heatmap. Yellow marks the cities the agent recommends starting in.">
      <div className="grid gap-5 md:grid-cols-[1.5fr_1fr]">
        <MarketsMap markets={markets} picked={picked} />
        <ol className="space-y-1.5">
          {markets.slice(0, 10).map((m, i) => (
            <li key={m.name} className="flex items-center justify-between gap-2 border-b border-line/60 pb-1.5 text-base">
              <span className={picked.includes(m.name) ? "font-semibold text-signal" : "text-ink/90"}>
                <span className="mr-2 text-sm text-faint">{i + 1}</span>
                {m.name}
              </span>
              <span className="text-sm text-muted">{pct(m.score)}</span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

function ChannelsCard({ channels, plan }: { channels: Channels; plan: Plan | null }) {
  const angle = new Map(plan?.marketing.map((m) => [m.entity_id, m.angle]));
  return (
    <Panel title="Where to reach them" sub="TV shows your audience watches more than average: good places for trailers, ads and press. Yellow marks the agent's picks.">
      <ul className="grid gap-3 sm:grid-cols-2">
        {channels.tv.slice(0, 6).map((e: Entity) => (
          <li key={e.id} className={`flex items-center gap-3 border p-2.5 ${angle.has(e.id) ? "border-signal/60 bg-signal-soft/40" : "border-line"}`}>
            <Poster src={e.image} title={e.name} className="w-11 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{e.name}</p>
              {angle.get(e.id) && <p className="text-sm text-signal">{angle.get(e.id)}</p>}
            </div>
          </li>
        ))}
        {!channels.tv.length && <li className="text-sm text-faint">No Qloo results.</li>}
      </ul>
    </Panel>
  );
}

function Compare({ s, past }: { s: State; past: boolean }) {
  return (
    <Panel title="Why not just ask a regular AI?" sub="We asked a plain AI model the same question with no data. It has to guess the release calendar and the audiences.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border border-line bg-black/30 p-4">
          <h4 className="mb-2 text-sm font-semibold text-muted">A regular AI, no data</h4>
          <div className="whitespace-pre-wrap text-base text-muted">{s.baseline ? s.baseline.replace(/\*\*/g, "").replace(/^\s*[*-]\s+/gm, "• ") : "Thinking…"}</div>
          <p className="mt-3 text-sm font-medium text-alert">No sources, so none of it can be checked.</p>
          {past && <p className="mt-2 text-sm text-warn">Note: this is a past release, so the AI may simply remember what happened. The fair test is a future window.</p>}
        </div>
        <div className="border border-signal/50 bg-signal-soft/30 p-4">
          <h4 className="mb-2 text-sm font-semibold text-signal">Counterprogram, using Qloo</h4>
          <ul className="space-y-2 text-base">
            <li>
              <b className="text-signal">{s.films.length}</b> real releases compared with your audience
            </li>
            <li>
              <b className="text-signal">{s.weekends.length}</b> Fridays scored, including films still in theaters
            </li>
            <li>
              <b className="text-signal">{s.rivals.length}</b> head-to-head audience comparisons
            </li>
            <li>
              <b className="text-signal">{s.markets.length}</b> cities ranked from Qloo&apos;s heatmap
            </li>
            <li>
              <b className="text-signal">{s.plan?.dropped_unverified ?? 0}</b> agent suggestions removed by the fact-check
            </li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}
