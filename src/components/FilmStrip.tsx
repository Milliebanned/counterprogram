"use client";

import Poster from "@/components/Poster";
import { usePosters } from "@/components/landing/usePosters";

const fmt = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const frameNo = (i: number) => `${Math.floor(i / 2) + 12}${i % 2 ? "A" : ""}`;

// A reel of upcoming releases: sprocket holes, frame numbers, posters in grayscale.
export default function FilmStrip({ caption = "Now showing · upcoming releases in Qloo", hint = "Hover a frame for colour" }: { caption?: string; hint?: string }) {
  const posters = usePosters();
  const frames: (typeof posters[number] | null)[] = posters.length ? posters : Array.from({ length: 12 }, () => null);
  const row = [...frames, ...frames];
  return (
    <div className="relative z-10 bg-background/70 py-4 backdrop-blur-sm">
      <div className="mx-auto mb-3 flex max-w-7xl items-center justify-between px-4 font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-alert" /> {caption}
        </span>
        <span className="hidden sm:block">{hint}</span>
      </div>
      <div className="film-strip overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
        <div className="animate-marquee w-max">
          <div className="film-edge" />
          <div className="flex py-1.5">
            {row.map((p, i) => (
              <div key={i} className="w-28 shrink-0 pr-2 md:w-32">
                {p ? (
                  <Poster mono src={p.url} title={p.name} label={`${p.name} · ${fmt(p.date)}`} />
                ) : (
                  <div className="grid aspect-[2/3] place-items-center border border-line bg-raised/50 font-mono text-[10px] text-faint">FRAME {frameNo(i)}</div>
                )}
                <p className="mt-1 text-center font-mono text-[9px] tracking-[0.3em] text-signal/60">▸ {frameNo(i)}</p>
              </div>
            ))}
          </div>
          <div className="film-edge" />
        </div>
      </div>
    </div>
  );
}
