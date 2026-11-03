"use client";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Explore first: it's open to everyone and the best first look at the app.
// Watchlist only for signed-in users: signed out, `/` is the landing page, not a Watchlist.
const LINKS = [
  { href: "/explore", label: "Explore", signedInOnly: false },
  { href: "/", label: "Watchlist", signedInOnly: true },
  { href: "/browse", label: "Browse", signedInOnly: false },
  { href: "/status", label: "Status", signedInOnly: false },
] as const;

/**
 * The main nav. path null: no current page marked (the fallback while the path isn't known yet).
 * signedIn false or unknown: no Watchlist, so it never flashes up for a signed-out visitor.
 */
export function SiteNavLinks({ path, signedIn = false }: { path: string | null; signedIn?: boolean }) {
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {LINKS.filter((l) => signedIn || !l.signedInOnly).map(({ href, label }) => {
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
  const { isSignedIn } = useAuth();
  return <SiteNavLinks path={usePathname()} signedIn={isSignedIn === true} />;
}
