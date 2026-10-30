"use client";

import { useEffect, useState } from "react";

export type PosterRef = { name: string; url: string; date: string };

let cache: Promise<PosterRef[]> | null = null;

// Upcoming-release posters from Qloo (one shared request per page load).
export function usePosters() {
  const [posters, setPosters] = useState<PosterRef[]>([]);
  useEffect(() => {
    let off = false;
    cache ??= fetch("/api/posters")
      .then((r) => r.json())
      .then((j) => (j.posters ?? []) as PosterRef[])
      .catch(() => []);
    cache.then((v) => {
      if (!off) setPosters(v);
    });
    return () => {
      off = true;
    };
  }, []);
  return posters;
}
