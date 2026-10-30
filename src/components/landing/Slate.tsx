"use client";

import { useEffect, useState } from "react";
import Poster from "@/components/Poster";
import { Scramble } from "@/components/Fx";
import { usePosters } from "./usePosters";

// Risk per Friday from a real run (Hollow Hours, indie horror, Feb 5 – Apr 30 2027).
const RISKS = [0.08, 0.2, 0.1, 0.07, 0.1, 0.38, 0.89, 0.62, 0.28, 0.02, 0.29, 0.16, 0.31];
const PICK = 9;
const color = (r: number) => (r >= 0.55 ? "#ff4b2b" : r >= 0.35 ? "#ff9f1c" : r >= 0.18 ? "#b7b41e" : "#f0ed12");

function Cell({ k, v, big }: { k: string; v: string; big?: boolean }) {
  return (
    <div className="px-2.5 py-1.5">
      <p className="font-mono text-[8px] uppercase tracking-[0.25em] text-faint">{k}</p>
      <p className={`font-display font-bold uppercase leading-tight ${big ? "text-base" : "text-xs"}`}>{v}</p>
    </div>
  );
}

// A film slate (clapperboard) that "claps" shut when the agent locks onto an opening date.
export default function Slate() {
  const [t, setT] = useState(0);
  const posters = usePosters();
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 1), 2300);
    return () => clearInterval(id);
  }, []);
  const phase = t % 3;
  const cycle = Math.floor(t / 3);
  const locked = phase > 0;
  const fan = posters.length >= 3 ? [posters[2], posters[5 % posters.length], posters[3]] : [];

  return (
    <div className="relative mx-auto w-full max-w-[390px]">
      {fan.length === 3 && (
        <div className="relative z-0 h-[250px]">
          <Poster mono src={fan[0].url} title={fan[0].name} className="absolute left-1 top-12 w-[138px] -rotate-[9deg]" />
          <Poster mono src={fan[2].url} title={fan[2].name} className="absolute right-1 top-14 w-[138px] rotate-[8deg]" />
          <Poster mono src={fan[1].url} title={fan[1].name} tone="signal" className="absolute left-1/2 top-0 z-10 w-[150px] -translate-x-1/2" />
        </div>
      )}

      <div className={`relative z-20 pt-8 ${fan.length ? "-mt-12" : ""}`}>
        <div className="clap-arm clap-stripes absolute inset-x-0 top-0 h-8 border-2 border-ink/80" style={{ transform: `rotate(${locked ? 0 : -15}deg)` }} />
        <div className="brackets border-2 border-ink/80 bg-black/95 backdrop-blur">
          <div className="clap-stripes h-5 border-b-2 border-ink/80" />
          <div className="grid grid-cols-[1.35fr_1fr_0.55fr] divide-x divide-ink/25 border-b border-ink/25">
            <Cell k="Prod." v="Hollow Hours" big />
            <Cell k="Scene" v="Opening weekend" />
            <Cell k="Take" v={String((cycle % 9) + 1).padStart(2, "0")} big />
          </div>
          <div className="grid grid-cols-2 divide-x divide-ink/25 border-b border-ink/25">
            <Cell k="Director" v="The agent" />
            <Cell k="Camera" v="Qloo audience data" />
          </div>
          <div className="px-3 pb-3 pt-2">
            <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.25em] text-faint">
              <span>Release date</span>
              <span className="flex items-center gap-1.5 text-muted">
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-alert" /> {locked ? "locked" : "analysing…"}
              </span>
            </div>
            <p className={`font-display text-[2.5rem] font-bold leading-none tracking-tight ${locked ? "text-signal" : "text-faint"}`}>
              {locked ? <Scramble key={cycle} text="FRI 09 APR 2027" ms={700} /> : "ROLLING…"}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">{locked ? "Clear run · 2% overlap with rival films" : "Comparing 32 of 87 upcoming releases"}</p>
            <div className="mt-3 flex h-12 items-end gap-1">
              {RISKS.map((r, i) => (
                <div key={`${cycle}-${i}-${locked}`} className={`relative flex-1 ${locked ? "animate-grow" : ""}`} style={{ height: locked ? `${Math.max(6, r * 100)}%` : "8%", animationDelay: `${i * 50}ms` }}>
                  <div
                    className="h-full w-full"
                    style={{
                      background: locked ? color(r) : "#2b2b27",
                      backgroundImage: "repeating-linear-gradient(to top, transparent 0 4px, rgba(0,0,0,0.6) 4px 5px)",
                      outline: locked && i === PICK ? "2px solid #ecebe3" : undefined,
                      outlineOffset: 1,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[8px] text-faint">
              <span>FEB 5</span>
              <span>EVERY FRIDAY IN THE WINDOW</span>
              <span>APR 30</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
