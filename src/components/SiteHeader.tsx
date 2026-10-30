import Link from "next/link";
import Logo from "./Logo";

export default function SiteHeader({ variant }: { variant: "landing" | "agent" }) {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
          <div className="leading-none">
            <p className="font-display text-xl font-bold uppercase tracking-[0.22em]">Counterprogram</p>
            <p className="mt-1 hidden text-xs tracking-wide text-faint sm:block">The AI analyst for film releases</p>
          </div>
        </Link>
        {variant === "landing" ? (
          <nav className="flex items-center gap-5 text-sm font-medium text-muted">
            <a href="#method" className="hidden hover:text-signal sm:inline">
              How it works
            </a>
            <a href="#dossier" className="hidden hover:text-signal sm:inline">
              Example result
            </a>
            <Link href="/agent" className="cut bg-signal px-4 py-2 font-display text-sm font-bold tracking-[0.18em] text-black transition hover:brightness-110">
              Launch agent →
            </Link>
          </nav>
        ) : (
          <nav className="flex items-center gap-4 text-sm font-medium text-muted">
            <span className="hidden items-center gap-2 sm:flex">
              <span className="h-1.5 w-1.5 animate-blink rounded-full bg-signal" />
              Taste data by <b className="text-ink">Qloo</b>
            </span>
            <Link href="/" className="border border-line px-3 py-1.5 transition hover:border-signal hover:text-signal">
              ← Home
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
