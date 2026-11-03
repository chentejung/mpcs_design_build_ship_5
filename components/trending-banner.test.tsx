// The landing page's trending banner, rendered from props (the page reads the Catalog as anon).
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROTATE_MS, TrendingBanner } from "@/components/trending-banner";
import type { Market } from "@/lib/markets";
import { trendingTopics } from "@/lib/trending";

function market(over: Partial<Market> & { id: string }): Market {
  return {
    question: `Question ${over.id}?`,
    slug: `q-${over.id}`,
    image: null,
    category: "politics",
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
    ...over,
  };
}

const TOPICS = trendingTopics([
  market({ id: "1", event_id: "e1", event_title: "Senate control", group_item_title: "Democrats", question: "Will the Democrats win the Senate?", volume_24h: 900, price: 0.62 }),
  market({ id: "2", question: "Hawks vs. Pacers", category: "sports", outcomes: ["Hawks", "Pacers"], volume_24h: 800, price: 0.4 }),
  market({ id: "3", question: "Will BTC hit $200k?", category: "crypto", volume_24h: 700 }),
  market({ id: "4", question: "Fed cut in December?", category: "finance", volume_24h: 600 }),
  market({ id: "5", question: "Best Picture winner?", category: "culture", volume_24h: 500 }),
  market({ id: "6", question: "Not trending", volume_24h: 1 }),
]);

const slide = () => screen.getByRole("group");
const title = () => slide().querySelector("h3")?.textContent;

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
afterEach(() => {
  restore?.();
  restore = null;
});

describe("trending banner", () => {
  it("is a carousel of the 5 topics in order, showing the first", () => {
    render(<TrendingBanner topics={TOPICS} />);
    const carousel = screen.getByRole("region", { name: "Trending topics" });
    expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
    const dots = screen.getAllByRole("button", { name: /^Show topic/ });
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual([
      "Show topic 1: Senate control",
      "Show topic 2: Hawks vs. Pacers",
      "Show topic 3: Will BTC hit $200k?",
      "Show topic 4: Fed cut in December?",
      "Show topic 5: Best Picture winner?",
    ]);
    expect(slide()).toHaveAttribute("aria-roledescription", "slide");
    expect(slide()).toHaveAttribute("aria-label", "1 of 5");
    expect(title()).toBe("Senate control");
    expect(screen.getByText("Most traded: Will the Democrats win the Senate?")).toBeInTheDocument();
    expect(screen.getByText("Politics")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Yes 62% chance, No 38% chance" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Senate control" })).toHaveAttribute("href", "/browse?category=politics");
    expect(dots[0]).toHaveAttribute("aria-current", "true");
  });

  it("moves with next, previous and the dots, wrapping round", () => {
    render(<TrendingBanner topics={TOPICS} />);
    fireEvent.click(screen.getByRole("button", { name: "Next topic" }));
    expect(slide()).toHaveAttribute("aria-label", "2 of 5");
    expect(title()).toBe("Hawks vs. Pacers");
    expect(screen.getByRole("img", { name: "Hawks 40% chance, Pacers 60% chance" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous topic" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous topic" }));
    expect(slide()).toHaveAttribute("aria-label", "5 of 5");
    expect(title()).toBe("Best Picture winner?");
    fireEvent.click(screen.getByRole("button", { name: "Show topic 3: Will BTC hit $200k?" }));
    expect(slide()).toHaveAttribute("aria-label", "3 of 5");
    expect(screen.getByRole("button", { name: "Show topic 3: Will BTC hit $200k?" })).toHaveAttribute("aria-current", "true");
  });

  it("rotates on its own, and pauses while hovered", () => {
    vi.useFakeTimers();
    render(<TrendingBanner topics={TOPICS} />);
    act(() => vi.advanceTimersByTime(ROTATE_MS));
    expect(slide()).toHaveAttribute("aria-label", "2 of 5");
    act(() => vi.advanceTimersByTime(ROTATE_MS));
    expect(slide()).toHaveAttribute("aria-label", "3 of 5");
    fireEvent.mouseEnter(screen.getByRole("region", { name: "Trending topics" }));
    act(() => vi.advanceTimersByTime(ROTATE_MS * 3));
    expect(slide()).toHaveAttribute("aria-label", "3 of 5");
    fireEvent.mouseLeave(screen.getByRole("region", { name: "Trending topics" }));
    act(() => vi.advanceTimersByTime(ROTATE_MS));
    expect(slide()).toHaveAttribute("aria-label", "4 of 5");
  });

  it("pauses while a control has focus", () => {
    vi.useFakeTimers();
    render(<TrendingBanner topics={TOPICS} />);
    act(() => screen.getByRole("button", { name: "Next topic" }).focus());
    act(() => vi.advanceTimersByTime(ROTATE_MS * 2));
    expect(slide()).toHaveAttribute("aria-label", "1 of 5");
  });

  it("doesn't rotate or slide when the viewer prefers reduced motion", () => {
    restore = reducedMotion();
    vi.useFakeTimers();
    render(<TrendingBanner topics={TOPICS} />);
    act(() => vi.advanceTimersByTime(ROTATE_MS * 3));
    expect(slide()).toHaveAttribute("aria-label", "1 of 5");
    expect(slide()).toHaveAttribute("data-motion", "off");
    fireEvent.click(screen.getByRole("button", { name: "Next topic" }));
    expect(slide()).toHaveAttribute("aria-label", "2 of 5");
  });

  it("renders nothing when there are no topics", () => {
    const { container } = render(<TrendingBanner topics={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
