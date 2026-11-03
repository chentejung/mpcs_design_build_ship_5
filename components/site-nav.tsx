"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Watchlist" },
  { href: "/browse", label: "Browse" },
  { href: "/status", label: "Status" },
] as const;

export function SiteNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const current = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 ${current ? "bg-raised text-ink" : "text-dim hover:text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
