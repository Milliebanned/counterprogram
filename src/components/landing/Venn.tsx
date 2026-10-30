"use client";

import { useEffect, useState } from "react";

const R = 88;

// Fraction of one circle covered by the other (equal radii, centres d apart).
function lens(d: number) {
  if (d >= 2 * R) return 0;
  const a = 2 * R * R * Math.acos(d / (2 * R)) - (d / 2) * Math.sqrt(4 * R * R - d * d);
  return a / (Math.PI * R * R);
}

// The Barbenheimer test as a toy: two audiences drifting together and apart.
export default function Venn() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 1), 50);
    return () => clearInterval(id);
  }, []);
  const d = 118 + 92 * Math.sin(t / 26);
  const o = lens(d);
  const same = o >= 0.55;
  const diff = o < 0.33;
  const cx = 240;
  return (
    <div className="brackets border border-line bg-surface p-4">
      <svg viewBox="0 0 480 250" className="w-full" aria-label="Two audiences overlapping">
        <defs>
          <clipPath id="clipA">
            <circle cx={cx - d / 2} cy="118" r={R} />
          </clipPath>
        </defs>
        <circle cx={cx - d / 2} cy="118" r={R} fill="#f0ed12" fillOpacity="0.1" stroke="#f0ed12" strokeWidth="1.5" />
        <circle cx={cx + d / 2} cy="118" r={R} fill="#ecebe3" fillOpacity="0.06" stroke="#ecebe3" strokeOpacity="0.7" strokeWidth="1.5" />
        <circle cx={cx + d / 2} cy="118" r={R} fill={same ? "#ff4b2b" : "#f0ed12"} fillOpacity={same ? 0.55 : 0.5} clipPath="url(#clipA)" />
        <text x={cx - d / 2} y="22" textAnchor="middle" fill="#f0ed12" fontSize="13" fontFamily="var(--font-figtree), sans-serif" fontWeight="600" letterSpacing="1.5">
          YOUR FILM
        </text>
        <text x={cx + d / 2} y="22" textAnchor="middle" fill="#ecebe3" fillOpacity="0.8" fontSize="13" fontFamily="var(--font-figtree), sans-serif" fontWeight="600" letterSpacing="1.5">
          RIVAL
        </text>
        <text x="240" y="236" textAnchor="middle" fill="#a0a096" fontSize="13" fontFamily="var(--font-figtree), sans-serif" fontWeight="600" letterSpacing="1.5">
          SHARED AUDIENCE {Math.round(o * 100)}%
        </text>
      </svg>
      <p className={`text-center font-display text-2xl font-bold uppercase tracking-wide ${same ? "text-alert" : diff ? "text-signal" : "text-warn"}`}>
        {same ? "Same audience: you'd split it" : diff ? "Different audience: safe to open near" : "Some overlap"}
      </p>
    </div>
  );
}
