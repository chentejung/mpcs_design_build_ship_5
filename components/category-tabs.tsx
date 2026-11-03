// The Category tabs on Browse, each with a small icon; the current one is marked aria-current="page".
// Presentational (no data), so it is component-tested. Icons are inline SVG: decorative, the label names the tab.
import Link from "next/link";
import { CATEGORIES, type CategorySlug } from "@/lib/markets";

// 24×24 outline paths, drawn with currentColor.
const ICONS: Record<CategorySlug, React.ReactNode> = {
  // A columned building.
  politics: <path d="M3 21h18M12 3 4 7v3h16V7l-8-4ZM6 10v8M10 10v8M14 10v8M18 10v8M4 18h16" />,
  // A ball.
  sports: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9.5c3 1 5.6 3.6 6.6 8.9M14.5 3.4c-1 3.6-.3 7.3 6 9.6M7 5.1c3.6 1.5 8.8 1.4 12.3-.1" />
    </>
  ),
  // A coin.
  crypto: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 7.5v9M10 7.5h3a2 2 0 0 1 0 4h-3m0 0h3.5a2.25 2.25 0 0 1 0 4.5H10M12 6v1.5M12 16.5V18" />
    </>
  ),
  // A rising line chart.
  finance: <path d="M3 3v18h18M7 15l4-4 3 3 6-7M15 7h5v5" />,
  // A chip.
  tech: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </>
  ),
  // A globe.
  world: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z" />
    </>
  ),
  // A star.
  culture: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3Z" />,
};

export function CategoryTabs({ current }: { current: CategorySlug }) {
  return (
    <nav aria-label="Category" className="-mx-1 mt-4 overflow-x-auto">
      <ul className="flex min-w-max gap-1.5 px-1 pb-1">
        {CATEGORIES.map((c) => {
          const active = c.slug === current;
          return (
            <li key={c.slug}>
              <Link
                href={`/browse?category=${c.slug}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent text-on-accent shadow-card"
                    : "border-line bg-panel text-dim hover:border-accent hover:text-ink"
                }`}
              >
                <svg
                  data-testid={`tab-icon-${c.slug}`}
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ICONS[c.slug]}
                </svg>
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
