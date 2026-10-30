"use client";

import { useEffect, useState } from "react";
import { Typed } from "@/components/Fx";

type Line = { k: "step" | "think" | "check" | "call" | "result"; t: string };

// Lines are taken from a real run (Hollow Hours, indie horror, Feb 5 – Apr 30 2027).
const STEPS: { n: string; name: string; title: string; body: string; call: string; lines: Line[] }[] = [
  {
    n: "01",
    name: "CASTING",
    title: "Find your comps in Qloo",
    body: "It looks up your three similar films. If a title doesn't match anything, it tells you instead of guessing.",
    call: "GET /search",
    lines: [
      { k: "think", t: "I will resolve the comparable titles to build the audience profile." },
      { k: "step", t: "Looking up your comparable films in Qloo: Hereditary, Talk to Me, The Witch" },
      { k: "call", t: "GET /search · 5 results" },
    ],
  },
  {
    n: "02",
    name: "AUDIENCE",
    title: "Learn who the audience is",
    body: "Qloo tells it the age, gender and taste of the people who love those films.",
    call: "GET /v2/insights · demographics",
    lines: [
      { k: "step", t: "Asking Qloo who watches these films: age, gender and taste" },
      { k: "call", t: "GET /v2/insights · demographics · 1 result" },
    ],
  },
  {
    n: "03",
    name: "THE SLATE",
    title: "Measure every rival on the calendar",
    body: "It pulls every film releasing in your window, then asks Qloo how much of your audience each one shares.",
    call: "GET /v2/analysis/compare",
    lines: [
      { k: "step", t: "Asking Qloo for every film releasing Feb 5 – Apr 30" },
      { k: "step", t: "Found 87 releases. Comparing your audience's taste with the 32 that matter most" },
      { k: "call", t: "GET /v2/analysis/compare · Wolf Creek: Legacy · 12 results" },
    ],
  },
  {
    n: "04",
    name: "SCREEN TEST",
    title: "Stress-test the quietest Fridays",
    body: "It shortlists the best-looking weekends and checks who opens within two weeks of each, same crowd or different.",
    call: "test_weekend → compare_rival",
    lines: [
      { k: "think", t: "I will test the quietest weekends before deciding." },
      { k: "step", t: "Testing Apr 9 as an opening date: who else is in theaters that fortnight?" },
      { k: "step", t: "Testing Feb 26 as an opening date: who else is in theaters that fortnight?" },
    ],
  },
  {
    n: "05",
    name: "SECOND TAKE",
    title: "Argue with itself",
    body: "A self-check compares the plan with the numbers. If the agent picks a riskier date without a reason, the plan is sent back.",
    call: "server-side self-check",
    lines: [{ k: "check", t: "Self-check passed: the plan agrees with Qloo's numbers" }],
  },
  {
    n: "06",
    name: "PREMIERE",
    title: "Hand you the release plan",
    body: "A date, weekends to avoid, a big release to open against, the cities to start in and the TV your audience watches.",
    call: "GET /v2/insights · heatmap",
    lines: [
      { k: "step", t: "Asking Qloo where in the US this audience is concentrated" },
      { k: "result", t: "◎ RECOMMENDED OPENING: FRI 09 APR 2027 · CLEAR" },
    ],
  },
];

const style: Record<Line["k"], string> = {
  step: "text-ink",
  think: "border-l border-line pl-2 italic text-muted",
  check: "border border-signal/60 bg-signal-soft px-2 py-1 text-signal",
  call: "text-faint",
  result: "border border-signal bg-signal px-2 py-1.5 font-bold text-black",
};
const prefix: Record<Line["k"], string> = { step: "> ", think: "// ", check: "[check] ", call: "  ", result: "" };

export default function MethodDemo() {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setActive((a) => {
        if (a === STEPS.length - 1) {
          setCycle((c) => c + 1);
          return 0;
        }
        return a + 1;
      });
    }, 3600);
    return () => clearInterval(id);
  }, [paused, active]);

  const lines = STEPS.slice(0, active + 1).flatMap((s, si) => s.lines.map((l, li) => ({ ...l, key: `${cycle}-${si}-${li}` })));

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="brackets border border-line bg-black/70">
        <div className="flex items-center justify-between border-b border-line px-3 py-2 text-sm">
          <span className="flex items-center gap-2 font-medium text-signal">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-signal" /> agent://counterprogram
          </span>
          <span className="text-faint">Replay of a real run</span>
        </div>
        <ol className="flex h-[420px] flex-col justify-end gap-1.5 overflow-hidden px-3 py-3 font-mono text-[13px] leading-snug">
          {lines.map((l) => (
            <li key={l.key} className={l.k === "call" ? "text-faint" : style[l.k]}>
              {prefix[l.k]}
              <Typed text={l.t} cps={140} />
            </li>
          ))}
          <li className="text-signal">
            &gt; <span className="animate-blink">▌</span>
          </li>
        </ol>
        <p className="border-t border-line px-3 py-2 text-sm text-faint">
          {paused ? "Paused. Move the mouse away to resume." : "Film: Hollow Hours · Window: Feb 5 – Apr 30, 2027"}
        </p>
      </div>

      <ol className="space-y-2">
        {STEPS.map((s, i) => {
          const on = i === active;
          return (
            <li key={s.n}>
              <button
                onClick={() => {
                  setActive(i);
                  setCycle((c) => c + 1);
                }}
                className={`relative w-full overflow-hidden border p-3 text-left transition ${on ? "border-signal bg-signal-soft/40" : "border-line hover:border-faint"}`}
              >
                <div className="flex items-baseline gap-3">
                  <span className={`font-mono text-[11px] tracking-widest ${on ? "text-signal" : "text-faint"}`}>{s.n}</span>
                  <span className={`font-display text-xl font-bold uppercase tracking-wide ${on ? "text-signal" : "text-ink/70"}`}>{s.name}</span>
                  <span className={`hidden truncate text-base sm:inline ${on ? "text-ink" : "text-faint"}`}>{s.title}</span>
                </div>
                {on && (
                  <>
                    <p className="mt-2 text-base leading-snug text-muted">{s.body}</p>
                    <p className="mt-2 text-sm text-faint">
                      Uses: <span className="font-mono text-signal">{s.call}</span>
                    </p>
                    {!paused && <span key={`${cycle}-${active}`} className="animate-fill absolute bottom-0 left-0 h-0.5 bg-signal" />}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
