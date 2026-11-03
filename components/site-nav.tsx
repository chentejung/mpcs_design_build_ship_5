"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Watchlist" },
  { href: "/browse", label: "Browse" },
  { href: "/explore", label: "Explore" },
  { href: "/status", label: "Status" },
] as const;

/** The links with no current page marked: the fallback while the path isn't known yet. */
export function SiteNavLinks({ path }: { path: string | null }) {
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const current = path !== null && (href === "/" ? path === "/" : path.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 ${current ? "bg-accent-soft font-medium text-accent" : "text-dim hover:bg-raised hover:text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SiteNav() {
  return <SiteNavLinks path={usePathname()} />;
}
