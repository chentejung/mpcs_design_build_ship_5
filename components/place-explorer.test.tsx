// Markets by place on the landing page: the list of places, the selected place's panel and the Global shelf,
// rendered from props. The WebGL globe is replaced by a stand-in that shows the props it got and lets a test
// "click a marker".
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceExplorer } from "@/components/place-explorer";
import type { GlobeProps } from "@/components/globe";
import type { PlacedMarket } from "@/lib/places";

const globe = vi.hoisted(() => ({ supported: true }));

vi.mock("@/components/globe", () => ({
  supportsGlobe: () => globe.supported,
  subscribeGlobeSupport: () => () => {},
  Globe: ({ places, selected, onSelect, autoRotate, reducedMotion }: GlobeProps) => (
    <div
      data-testid="globe"
      data-auto-rotate={String(autoRotate)}
      data-reduced-motion={String(reducedMotion)}
      data-selected={selected ?? ""}
    >
      {places.map((p) => (
        <button key={p.code} type="button" onClick={() => onSelect(p.code)}>
          marker {p.code}
        </button>
      ))}
    </div>
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
  market({ id: "1", question: "Will Iran and Israel agree a ceasefire?", places: ["IR", "IL"], volume_24h: 900, price: 0.3 }),
  market({ id: "2", question: "Will Iran hold elections?", places: ["IR"], volume_24h: 100 }),
  market({ id: "3", question: "Who wins the Senate?", category: "politics", places: ["US"], volume_24h: 500 }),
  market({ id: "4", question: "Will BTC hit $200k?", category: "crypto", places: [], volume_24h: 2000 }),
];

const RENDERED_AT = "2026-11-03T12:00:00.000Z";
const show = (markets = MARKETS) => render(<PlaceExplorer markets={markets} renderedAt={RENDERED_AT} />);
const panel = () => screen.getByRole("region", { name: /^(Iran|Israel|United States)$/ });
const shelf = () => screen.getByRole("region", { name: "Global" });
const names = (el: HTMLElement) => within(el).getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);

function reducedMotion() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

let restore: (() => void) | null = null;
beforeEach(() => {
  globe.supported = true;
});
afterEach(() => {
  restore?.();
  restore = null;
});

describe("places on the landing page", () => {
  it("lists every place with Markets as a button, busiest first", () => {
    show();
    const list = screen.getByRole("navigation", { name: "Places" });
    expect(within(list).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Iran, 2 Markets",
      "Israel, 1 Market",
      "United States, 1 Market",
    ]);
  });

  it("opens on the busiest place, and shows another place's Markets when it is picked", () => {
    show();
    expect(screen.getByRole("button", { name: "Iran, 2 Markets" })).toHaveAttribute("aria-pressed", "true");
    expect(names(panel())).toEqual(["Will Iran and Israel agree a ceasefire?", "Will Iran hold elections?"]);

    fireEvent.click(screen.getByRole("button", { name: "United States, 1 Market" }));
    expect(screen.getByRole("button", { name: "United States, 1 Market" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Iran, 2 Markets" })).toHaveAttribute("aria-pressed", "false");
    expect(names(panel())).toEqual(["Who wins the Senate?"]);
    expect(within(panel()).getByText(/^1 Market ·/)).toHaveTextContent("1 Market · $500 24h");
  });

  it("selects a place from a globe marker too", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "marker IL" }));
    expect(names(panel())).toEqual(["Will Iran and Israel agree a ceasefire?"]);
    expect(screen.getByTestId("globe")).toHaveAttribute("data-selected", "IL");
  });

  it("shows each Market's split and a signed-out Follow that returns to Browse to follow it", () => {
    show();
    expect(within(panel()).getByRole("img", { name: "Yes 30% chance, No 70% chance" })).toBeInTheDocument();
    const follow = within(panel()).getByRole("button", { name: "Follow Will Iran hold elections?" });
    expect(follow.closest("[data-testid=sign-in]")).toHaveAttribute("data-redirect", "/browse?category=world&follow=2");
  });

  it("puts Markets with no place on the Global shelf", () => {
    show();
    expect(names(shelf())).toEqual(["Will BTC hit $200k?"]);
    expect(
      within(shelf()).getByRole("button", { name: "Follow Will BTC hit $200k?" }).closest("[data-testid=sign-in]"),
    ).toHaveAttribute("data-redirect", "/browse?category=crypto&follow=4");
  });

  it("shows everything on the Global shelf, with no globe or list, before any Market has a place", () => {
    show(MARKETS.map((m) => ({ ...m, places: [] })));
    expect(screen.queryByTestId("globe")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Places" })).not.toBeInTheDocument();
    expect(screen.getByText("No Market has a place yet, so they are all on the Global shelf below.")).toBeInTheDocument();
    expect(names(shelf())).toEqual(["Will BTC hit $200k?", "Will Iran and Israel agree a ceasefire?", "Who wins the Senate?", "Will Iran hold elections?"]);
  });

  it("names each Market by its full question, since there is no Event heading here", () => {
    show([market({ id: "9", question: "Will the Democrats win the Senate?", event_title: "Senate control", group_item_title: "Democrats" })]);
    expect(names(shelf())).toEqual(["Will the Democrats win the Senate?"]);
  });

  it("limits a long shelf to 6 Markets until Show all", () => {
    show(Array.from({ length: 8 }, (_, i) => market({ id: String(i + 1), volume_24h: 100 - i })));
    expect(names(shelf())).toHaveLength(6);
    fireEvent.click(within(shelf()).getByRole("button", { name: "Show all 8" }));
    expect(names(shelf())).toHaveLength(8);
  });

  it("turns the globe gently until a place is picked", () => {
    show();
    expect(screen.getByTestId("globe")).toHaveAttribute("data-auto-rotate", "true");
    expect(screen.getByTestId("globe")).toHaveAttribute("data-reduced-motion", "false");
    fireEvent.click(screen.getByRole("button", { name: "United States, 1 Market" }));
    expect(screen.getByTestId("globe")).toHaveAttribute("data-auto-rotate", "false");
  });

  it("never auto-rotates or flies under reduced motion", () => {
    restore = reducedMotion();
    show();
    expect(screen.getByTestId("globe")).toHaveAttribute("data-auto-rotate", "false");
    expect(screen.getByTestId("globe")).toHaveAttribute("data-reduced-motion", "true");
  });

  it("keeps the list and panel without the globe on small screens or without WebGL", () => {
    globe.supported = false;
    show();
    expect(screen.queryByTestId("globe")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Israel, 1 Market" }));
    expect(names(panel())).toEqual(["Will Iran and Israel agree a ceasefire?"]);
  });
});
