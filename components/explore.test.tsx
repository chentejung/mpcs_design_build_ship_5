// Explore's content (shared with the signed-out landing), rendered from given data: the freshness line on Explore,
// the trending banner, the places and the Global shelf, and each card's Follow for the viewer. The server-only data
// load and the WebGL globe are mocked out.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExploreView } from "@/components/explore";
import { SIGNED_OUT } from "@/components/place-panel";
import type { PlacedMarket } from "@/lib/places";

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null }) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/supabase", () => ({ supabase: () => ({}) }));
vi.mock("@/components/globe", () => ({
  supportsGlobe: () => true,
  subscribeGlobeSupport: () => () => {},
  Globe: ({ places, arcs }: { places: { code: string }[]; arcs: { from: string; to: string }[] }) => (
    <div data-testid="globe" data-places={places.map((p) => p.code).join(",")} data-arcs={arcs.map((a) => `${a.from}-${a.to}`).join(",")} />
  ),
}));
vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children, forceRedirectUrl }: { children: React.ReactElement; forceRedirectUrl: string }) => (
    <span data-testid="sign-in" data-redirect={forceRedirectUrl}>
      {children}
    </span>
  ),
}));

function market(over: Partial<PlacedMarket> & { id: string }): PlacedMarket {
  return {
    question: `Question ${over.id}?`,
    slug: `q-${over.id}`,
    image: null,
    category: "world",
    event_id: null,
    event_title: null,
    group_item_title: null,
    outcomes: ["Yes", "No"],
    price: 0.5,
    price_changed_at: null,
    volume_24h: 1000,
    end_date: null,
    closed: false,
    closed_at: null,
    places: [],
    ...over,
  };
}

const MARKETS = [
  market({ id: "1", question: "Will Iran and Israel agree a ceasefire?", places: ["IR", "IL"], volume_24h: 900 }),
  market({ id: "2", question: "Will the US strike Iran?", places: ["US", "IR"], volume_24h: 500 }),
  market({ id: "3", question: "Will BTC hit $200k?", category: "crypto", volume_24h: 2000 }),
];
const RENDERED_AT = "2026-11-03T12:00:00.000Z";
const RUNS = [{ finished_at: "2026-11-03T11:59:55.000Z", ok: true, skipped: false, error: null }];

const panel = () => screen.getByRole("region", { name: "Iran" });

describe("Explore", () => {
  it("shows the freshness line, the trending banner, the globe with its arcs, and the Global shelf", () => {
    render(<ExploreView markets={MARKETS} renderedAt={RENDERED_AT} viewer={SIGNED_OUT} runs={RUNS} />);
    expect(screen.getByText(/Prices as of/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trending topics" })).toBeInTheDocument();
    expect(screen.getByTestId("globe")).toHaveAttribute("data-places", "IR,IL,US");
    expect(screen.getByTestId("globe")).toHaveAttribute("data-arcs", "IL-IR,IR-US");
    expect(within(screen.getByRole("region", { name: "Global" })).getByText("Will BTC hit $200k?")).toBeInTheDocument();
  });

  it("has no freshness line on the landing", () => {
    render(<ExploreView markets={MARKETS} renderedAt={RENDERED_AT} viewer={SIGNED_OUT} runs={null} />);
    expect(screen.queryByText(/Prices as of/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trending topics" })).toBeInTheDocument();
  });

  it("signed out, Follow comes back to Explore to follow the Market", () => {
    render(
      <ExploreView markets={MARKETS} renderedAt={RENDERED_AT} viewer={{ signedIn: false, followed: [], returnTo: "/explore" }} runs={RUNS} />,
    );
    const follow = within(panel()).getByRole("button", { name: "Follow Will the US strike Iran?" });
    expect(follow.closest("[data-testid=sign-in]")).toHaveAttribute("data-redirect", "/explore?follow=2");
  });

  it("signed in, shows which Markets the viewer already follows", () => {
    render(
      <ExploreView markets={MARKETS} renderedAt={RENDERED_AT} viewer={{ signedIn: true, followed: ["1"], returnTo: "/explore" }} runs={RUNS} />,
    );
    expect(within(panel()).getByRole("button", { name: "Unfollow Will Iran and Israel agree a ceasefire?" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(panel()).getByRole("button", { name: "Follow Will the US strike Iran?" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("sign-in")).not.toBeInTheDocument();
  });
});
