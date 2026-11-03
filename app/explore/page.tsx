import type { Metadata } from "next";
import { ExploreContent } from "@/components/explore";

export const metadata: Metadata = { title: "Explore" };

// Explore: the trending banner and the globe of Markets by place, for everyone, signed in or out (signed out, the
// landing page shows the same). Static like Browse: Prices as of page load, with a freshness line and Refresh.
export default function ExplorePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
      <p className="mt-1 text-sm text-dim">What&rsquo;s trading most right now, and where in the world it&rsquo;s about.</p>
      <div className="mt-4">
        <ExploreContent on="explore" />
      </div>
    </>
  );
}
