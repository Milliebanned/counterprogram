const SIGNAL = "#f0ed12";

// A clapperboard.
export default function Logo() {
  return (
    <svg width="32" height="30" viewBox="0 0 32 30" aria-hidden>
      <g transform="rotate(-12 3 11)">
        <rect x="3" y="4" width="26" height="6" fill={SIGNAL} />
        <path d="M9 4 L5 10 M16 4 L12 10 M23 4 L19 10" stroke="#0b0b0a" strokeWidth="2.4" />
      </g>
      <rect x="3" y="12" width="26" height="15" fill="none" stroke={SIGNAL} strokeWidth="1.8" />
      <path d="M3 17 H29" stroke={SIGNAL} strokeWidth="1.2" />
      <path d="M12 19.5 L12 25" stroke={SIGNAL} strokeOpacity="0.6" strokeWidth="1.2" />
    </svg>
  );
}
