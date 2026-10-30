"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "signal", label: "Now showing" },
  { id: "method", label: "Editing room" },
  { id: "dossier", label: "Premiere" },
];

// Fixed right-hand progress rail: shows which of the three sections you're in.
export default function SectionRail() {
  const [active, setActive] = useState("signal");
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);
  return (
    <nav className="no-print fixed right-4 top-1/2 z-50 hidden -translate-y-1/2 flex-col items-end gap-4 xl:flex" aria-label="Sections">
      {SECTIONS.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} className="group flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em]">
          <span className={`transition ${active === s.id ? "text-signal" : "text-faint"}`}>
            <span className="hidden group-hover:inline">{s.label} </span>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className={`block h-px transition-all ${active === s.id ? "w-10 bg-signal" : "w-5 bg-faint group-hover:w-8"}`} />
        </a>
      ))}
    </nav>
  );
}
