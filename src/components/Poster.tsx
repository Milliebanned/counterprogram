"use client";

import { useState } from "react";

type Tone = "ink" | "signal" | "alert";

// A film poster. Full colour by default so people recognise the film; `mono` gives the grainy
// grayscale film look used in decorative strips (colour returns on hover).
export default function Poster({
  src,
  title,
  label,
  tone = "ink",
  mono = false,
  className = "",
}: {
  src?: string;
  title: string;
  label?: string;
  tone?: Tone;
  mono?: boolean;
  className?: string;
}) {
  const [bad, setBad] = useState(false);
  const frame = mono
    ? tone === "alert"
      ? "brackets brackets-alert"
      : tone === "signal"
        ? "brackets"
        : "brackets brackets-dim"
    : tone === "alert"
      ? "outline outline-2 outline-alert"
      : tone === "signal"
        ? "outline outline-2 outline-signal"
        : "outline outline-1 outline-line";
  return (
    <figure className={`group ${/\babsolute\b/.test(className) ? "" : "relative"} aspect-[2/3] overflow-hidden bg-raised ${frame} ${className}`} title={title}>
      {src && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBad(true)}
          className={`h-full w-full object-cover ${mono ? "grayscale contrast-125 brightness-90 transition duration-500 group-hover:grayscale-0 group-hover:brightness-100" : ""}`}
        />
      ) : (
        <div className="grid h-full w-full place-items-center p-1.5 text-center text-[10px] font-medium leading-tight text-muted">{title}</div>
      )}
      {mono && tone === "alert" && <div className="pointer-events-none absolute inset-0 bg-alert/30 mix-blend-multiply" />}
      {label && (
        <figcaption
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-5 text-[10px] font-medium leading-tight ${
            tone === "alert" ? "text-alert" : tone === "signal" ? "text-signal" : "text-ink/90"
          }`}
        >
          {label}
        </figcaption>
      )}
    </figure>
  );
}
