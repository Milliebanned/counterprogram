import Link from "next/link";
import FilmStrip from "@/components/FilmStrip";
import SiteHeader from "@/components/SiteHeader";
import MethodDemo from "@/components/landing/MethodDemo";
import NamedPoster from "@/components/landing/NamedPoster";
import SectionRail from "@/components/landing/SectionRail";
import Slate from "@/components/landing/Slate";
import Venn from "@/components/landing/Venn";

const RISK = [0.08, 0.2, 0.1, 0.07, 0.1, 0.38, 0.89, 0.62, 0.28, 0.02, 0.29, 0.16, 0.31];
const barColor = (r: number) => (r >= 0.55 ? "#ff4b2b" : r >= 0.35 ? "#ff9f1c" : r >= 0.18 ? "#b7b41e" : "#f0ed12");

// Dust floating in the projector beam (deterministic so server and client agree).
const MOTES = [
  [88, 8, 0], [80, 16, 1.4], [92, 22, 2.8], [70, 12, 0.7], [84, 30, 4.1], [76, 26, 5.2], [95, 36, 3.3], [66, 20, 6.1], [88, 44, 1.9], [74, 38, 4.8], [82, 52, 2.2], [60, 30, 0.3],
];

function SectionHead({ reel, label, title, children }: { reel: string; label: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="scroll-reveal mb-10 max-w-3xl">
      <p className="mb-4 flex items-center gap-3 text-sm font-medium uppercase tracking-[0.2em] text-signal">
        <span className="inline-block h-px w-10 bg-signal" />
        Reel {reel} of 3 · {label}
      </p>
      <h2 className="font-display text-[clamp(2rem,4.6vw,3.8rem)] font-bold uppercase leading-[0.98] tracking-tight">{title}</h2>
      {children && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink/85">{children}</p>}
    </div>
  );
}

function Tile({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`scroll-reveal border border-line bg-surface p-5 ${className}`}>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-signal">{title}</p>
      {children}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader variant="landing" />
      <SectionRail />

      <main>
        {/* =============================== REEL 1 · NOW SHOWING =============================== */}
        <section id="signal" className="relative overflow-hidden border-b border-line">
          <div className="hud-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_30%_20%,#000,transparent_75%)]" />
          {/* projector beam */}
          <div className="beam animate-flicker pointer-events-none absolute right-0 top-0 h-full w-full" />
          {MOTES.map(([x, y, d], i) => (
            <span key={i} className="mote" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />
          ))}
          <div className="vertical absolute left-3 top-24 hidden text-[11px] uppercase tracking-[0.35em] text-faint xl:block">Counterprogram — the AI release analyst for films — reel 01</div>

          <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-4 pb-12 pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
            <div>
              <p className="mb-5 flex items-center gap-3 text-sm font-medium uppercase tracking-[0.2em] text-signal">
                <span className="inline-block h-px w-10 bg-signal" />
                Reel 1 of 3 · Now showing
              </p>
              <h1 className="font-display text-[clamp(2.6rem,6.4vw,5.6rem)] font-bold uppercase leading-[0.92] tracking-tight">
                When should
                <br />
                your movie
                <br />
                <span className="text-signal">
                  open?<span className="animate-blink">_</span>
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-xl leading-relaxed text-ink/90">
                Counterprogram is an <b className="text-signal">AI analyst for film releases</b>. Tell it about your movie. It studies who your audience is, checks <b className="text-signal">every other film opening
                near your date</b>, and tells you which Friday gives you the clearest run.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-5">
                <Link href="/agent" className="cut bg-signal px-8 py-4 font-display text-lg font-bold uppercase tracking-[0.15em] text-black transition hover:brightness-110">
                  ▶ Analyze my release
                </Link>
                <a href="#method" className="text-base text-muted underline underline-offset-4 hover:text-signal">
                  See how it works ↓
                </a>
              </div>

              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4">
                {[
                  ["250M+", "films, shows, places and people in Qloo's taste graph"],
                  ["6 steps", "find comps, read the slate, test, double-check"],
                  ["100%", "of recommendations traced to Qloo data"],
                ].map(([v, l]) => (
                  <div key={v} className="border-l-2 border-signal/60 pl-3">
                    <dt className="font-display text-3xl font-bold text-signal">{v}</dt>
                    <dd className="mt-0.5 text-sm leading-snug text-muted">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <Slate />
          </div>

          <FilmStrip />
        </section>

        {/* =============================== REEL 2 · THE EDITING ROOM =============================== */}
        <section id="method" className="relative border-b border-line px-4 py-20">
          <div className="hud-grid absolute inset-0 opacity-30 [mask-image:linear-gradient(180deg,transparent,#000_30%,#000_70%,transparent)]" />
          <div className="relative mx-auto max-w-7xl">
            <SectionHead
              reel="2"
              label="The editing room"
              title={
                <>
                  It doesn&apos;t guess. <span className="text-signal">It investigates.</span>
                </>
              }
            >
              The agent plans its own steps, tests the best weekends against real audience data and argues with its own plan before it answers. Watch a real run, or click any step.
            </SectionHead>
            <MethodDemo />
          </div>
        </section>

        {/* =============================== REEL 3 · THE PREMIERE =============================== */}
        <section id="dossier" className="relative px-4 py-20">
          <div className="relative mx-auto max-w-7xl">
            <SectionHead
              reel="3"
              label="The premiere"
              title={
                <>
                  A release plan, <span className="text-signal">not a chat.</span>
                </>
              }
            >
              Two films that share an audience split it. In July 2023 <i>Barbie</i> and <i>Oppenheimer</i> opened the same day and both won, because their audiences barely overlapped. Counterprogram measures
              that overlap for every release in your window, using audience data from Qloo instead of gut feel.
            </SectionHead>

            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="scroll-reveal">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted">The Barbenheimer test, illustrated</p>
                <Venn />
                <p className="mt-4 text-base leading-relaxed text-muted">
                  For the biggest films near every candidate Friday, the agent compares shared taste, plus age and gender when Qloo has them. A huge rival with a{" "}
                  <b className="text-signal">different audience</b> is not a threat. A small one with the <b className="text-alert">same audience</b> is.
                </p>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted">An example result · Hollow Hours, an indie horror, spring 2027</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Tile title="Best opening date" className="sm:col-span-2">
                    <p className="font-display text-5xl font-bold leading-none tracking-tight text-signal md:text-6xl">FRI 09 APR 2027</p>
                    <p className="mt-2 text-base text-muted">A clear run: only 2% competition for the audience. The agent&apos;s self-check passed.</p>
                    <div className="mt-4 flex h-14 items-end gap-1">
                      {RISK.map((r, i) => (
                        <div
                          key={i}
                          className="flex-1"
                          style={{ height: `${Math.max(6, r * 100)}%`, background: barColor(r), outline: i === 9 ? "2px solid #ecebe3" : undefined, outlineOffset: 1 }}
                        />
                      ))}
                    </div>
                  </Tile>
                  <Tile title="Weekends to avoid">
                    <ul className="space-y-3 text-base">
                      <li className="flex items-center gap-3">
                        <NamedPoster name="Wolf Creek: Legacy" tone="alert" />
                        <span>
                          <b className="text-alert">Mar 19</b> · Wolf Creek: Legacy
                          <span className="block text-sm text-muted">Same audience as yours. 89% competition.</span>
                        </span>
                      </li>
                      <li className="text-sm text-muted">
                        <b className="text-alert">Mar 12</b> · The Exorcist: also the same audience
                      </li>
                    </ul>
                  </Tile>
                  <Tile title="A big film to open near">
                    <div className="flex items-center gap-3 text-base">
                      <NamedPoster name="Sonic the Hedgehog 4" tone="signal" />
                      <span>
                        <b className="text-signal">Sonic the Hedgehog 4</b>
                        <span className="block text-sm text-muted">Huge, but a different audience. Safe to open near.</span>
                      </span>
                    </div>
                  </Tile>
                  <Tile title="Cities to start in">
                    <p className="text-lg font-medium leading-relaxed">Boston · Portland · Austin · Los Angeles · Seattle</p>
                    <p className="mt-2 text-sm text-muted">Where Qloo&apos;s heatmap says this audience is concentrated.</p>
                  </Tile>
                  <Tile title="Where to reach them">
                    <p className="text-lg font-medium leading-relaxed">The Midnight Club · From · Chapelwaite · Shining Vale</p>
                    <p className="mt-2 text-sm text-muted">TV this audience watches more than average.</p>
                  </Tile>
                </div>
              </div>
            </div>

            {/* ticket stub CTA */}
            <div className="scroll-reveal ticket relative mt-16 grid border border-signal/50 bg-surface md:grid-cols-[2fr_1fr]">
              <div className="relative p-8 md:p-12">
                <div className="hud-grid absolute inset-0 opacity-40 [mask-image:linear-gradient(110deg,#000,transparent_70%)]" />
                <div className="relative">
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-signal">★ Admit one · opening night</p>
                  <h3 className="mt-3 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-bold uppercase leading-[0.98] tracking-tight">
                    Your film is next.
                    <br />
                    Find its weekend<span className="animate-blink text-signal">_</span>
                  </h3>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-muted">No sign-up, about 30 seconds. Try an example or describe your own movie.</p>
                  <Link href="/agent" className="cut mt-6 inline-block bg-signal px-8 py-4 font-display text-lg font-bold uppercase tracking-[0.15em] text-black transition hover:brightness-110">
                    ▶ Analyze my release
                  </Link>
                </div>
              </div>
              <div className="border-t-2 border-dashed border-signal/40 p-6 md:border-l-2 md:border-t-0 md:p-8">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-muted">Or pick a seat</p>
                <ul className="space-y-2">
                  {[
                    ["horror", "Indie horror", "Spring 2027"],
                    ["drama", "Awards drama", "Winter 2026"],
                    ["family", "Animated family", "Summer 2027"],
                    ["oppenheimer", "Replay: Oppenheimer", "2023"],
                  ].map(([k, t, w]) => (
                    <li key={k}>
                      <Link href={`/agent?preset=${k}`} className="group flex items-center justify-between border border-line px-3 py-2.5 transition hover:border-signal">
                        <span className="font-display text-base font-semibold uppercase tracking-wide group-hover:text-signal">{t}</span>
                        <span className="text-sm text-muted">{w} →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="no-print border-t border-line px-4 py-8 text-center text-xs leading-relaxed text-faint">
        Built for the Qloo Agentic Hackathon. Taste data by Qloo. Qloo describes aggregate audiences, not individuals. Film imagery via Qloo.
      </footer>
    </div>
  );
}
