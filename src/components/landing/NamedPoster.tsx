"use client";

import Poster from "@/components/Poster";
import { usePosters } from "./usePosters";

// Shows a film's poster if it's among Qloo's upcoming releases; renders nothing otherwise.
export default function NamedPoster({ name, tone = "ink", className = "w-11" }: { name: string; tone?: "ink" | "signal" | "alert"; className?: string }) {
  const p = usePosters().find((x) => x.name === name);
  if (!p) return null;
  return <Poster src={p.url} title={p.name} tone={tone} className={`${className} shrink-0`} />;
}
