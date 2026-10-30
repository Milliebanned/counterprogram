"use client";

import { useEffect, useState } from "react";

const GLYPHS = "█▓▒░01<>/\\|+*#%&?";

// Decodes into its final text, like a signal locking on. Remount (key) to replay.
export function Scramble({ text, className = "", ms = 900 }: { text: string; className?: string; ms?: number }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / ms);
      setOut(
        text
          .split("")
          .map((ch, i) => (/[\s,.:/\-—]/.test(ch) || i / text.length < p ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(""),
      );
      if (p >= 1) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [text, ms]);
  return (
    <span className={className} aria-label={text}>
      {out}
    </span>
  );
}

// Types its text out once on mount, with a block cursor while typing.
export function Typed({ text, cps = 110 }: { text: string; cps?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const step = Math.max(1, Math.round(cps / 25));
    const id = setInterval(() => {
      setN((v) => {
        if (v + step >= text.length) {
          clearInterval(id);
          return text.length;
        }
        return v + step;
      });
    }, 40);
    return () => clearInterval(id);
  }, [text, cps]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="animate-blink text-signal">▌</span>}
    </>
  );
}
