"use client";
// The top-5 trending topics on the signed-out landing page (issue #14): one Event at a time, large, with its image,
// Category, title and its busiest Market's split (product rule 2), linking to its Category in Browse. Static like
// Browse: Prices as of page load. It rotates every ~6 s, pauses while hovered or focused, and under reduced motion
// neither rotates nor slides; the prev/next/dot buttons reach every topic. Neutral colours only (product rule 3).
import Link from "next/link";
import { useEffect, useState } from "react";
import { MarketThumb } from "@/components/market-thumb";
import { SplitBar } from "@/components/split-bar";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { volume } from "@/lib/format";
import { CATEGORIES, marketLabel } from "@/lib/markets";
import type { TrendingTopic } from "@/lib/trending";

export const ROTATE_MS = 6000;

const control =
  "grid size-8 place-items-center rounded-full border border-line bg-panel text-dim hover:border-accent hover:text-ink";

export function TrendingBanner({ topics }: { topics: readonly TrendingTopic[] }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const count = topics.length;
  const rotating = !reduced && !hovered && !focused && count > 1;

  // A timer per slide, so a manual change restarts the wait.
  useEffect(() => {
    if (!rotating) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(t);
  }, [rotating, index, count]);

  if (count === 0) return null;
  const i = Math.min(index, count - 1);
  const topic = topics[i];
  const go = (next: number) => setIndex(((next % count) + count) % count);
  const category = CATEGORIES.find((c) => c.slug === topic.category)?.label ?? topic.category;
  const leadLabel = marketLabel(topic.lead);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Trending topics"
      className="rounded-2xl border border-line bg-panel p-5 shadow-card sm:p-6"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Trending now</h2>
        <div className="flex items-center gap-2">
          <button type="button" className={control} aria-label="Previous topic" onClick={() => go(i - 1)}>
            <span aria-hidden>‹</span>
          </button>
          <button type="button" className={control} aria-label="Next topic" onClick={() => go(i + 1)}>
            <span aria-hidden>›</span>
          </button>
        </div>
      </div>

      <div aria-live={rotating ? "off" : "polite"}>
        <div
          key={topic.key}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
          data-motion={reduced ? "off" : "on"}
          className={`mt-4 flex flex-col gap-5 sm:flex-row sm:items-center ${reduced ? "" : "slide-in"}`}
        >
          <MarketThumb id={topic.lead.id} image={topic.image} category={topic.category} size={112} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-faint">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{category}</span>
              <span className="num">{volume(topic.volume24h)} 24h</span>
              {topic.marketCount > 1 ? <span>· {topic.marketCount} Markets</span> : null}
            </p>
            <h3 className="mt-2 line-clamp-2 text-2xl font-semibold leading-tight tracking-tight">
              <Link href={topic.href} className="hover:text-accent">
                {topic.title}
              </Link>
            </h3>
            {leadLabel !== topic.title ? (
              // The Event's busiest Market, by its full question: a group item alone ("None") can mislead.
              <p className="mt-1 truncate text-sm text-dim">Most traded: {topic.lead.question}</p>
            ) : null}
            <div className="mt-4 max-w-md">
              <SplitBar outcomes={topic.lead.outcomes} price={topic.lead.price} size="lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {topics.map((t, n) => (
            <button
              key={t.key}
              type="button"
              aria-label={`Show topic ${n + 1}: ${t.title}`}
              aria-current={n === i ? "true" : undefined}
              onClick={() => go(n)}
              className="grid h-6 place-items-center px-0.5"
            >
              <span
                aria-hidden
                className={`block h-1.5 rounded-full ${n === i ? "w-6 bg-accent" : "w-1.5 bg-side-b hover:bg-faint"}`}
              />
            </button>
          ))}
        </div>
        <Link href={topic.href} className="text-sm font-medium text-accent hover:text-accent-strong">
          See in Browse →
        </Link>
      </div>
    </section>
  );
}
