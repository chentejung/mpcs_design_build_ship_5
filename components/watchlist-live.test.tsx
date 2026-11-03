// The live Watchlist as a user sees it, with Supabase + Realtime replaced by a fake feed at its seam.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WatchlistFeedProvider } from "@/components/watchlist-feed";
import { WatchlistLive } from "@/components/watchlist-live";
import type { Run } from "@/lib/runs";
import type { Followed } from "@/lib/watchlist";
import { fakeFeed, type FakeFeed } from "@/test/fake-feed";

const NOW = "2026-11-03T12:00:00.000Z";

function market(over: Partial<Followed> & { id: string }): Followed {
  return {
    question: `Question ${over.id}?`,
    slug: `q-${over.id}`,
    image: null,
    category: "politics",
    event_id: null,
    event_title: null,
    group_item_title: null,
    outcomes: ["Yes", "No"],
    price: 0.62,
    price_changed_at: "2026-11-03T11:59:00.000Z",
    volume_24h: 1000,
    end_date: "2026-12-01T00:00:00.000Z",
    closed: false,
    closed_at: null,
    followed_at: "2026-11-01T00:00:00.000Z",
    ...over,
  } as Followed;
}

let runId = 100;
function run(over: Partial<Run> = {}): Run {
  runId += 1;
  return {
    id: runId,
    started_at: NOW,
    finished_at: NOW,
    ok: true,
    skipped: false,
    rows_changed: 1,
    catalog_refreshed: false,
    warnings: [],
    error: null,
    duration_ms: 300,
    ...over,
  };
}

function show(items: Followed[], runs: Run[] = [run()], feed: FakeFeed = fakeFeed()) {
  render(
    <WatchlistFeedProvider value={feed.useFeed}>
      <WatchlistLive initialItems={items} initialRuns={runs} renderedAt={NOW} />
    </WatchlistFeedProvider>,
  );
  return feed;
}

describe("live Watchlist", () => {
  it("shows both Outcomes of a Market as a split", () => {
    show([market({ id: "1", price: 0.62 })]);
    expect(screen.getByRole("img", { name: "Yes 62% chance, No 38% chance" })).toBeInTheDocument();
  });

  it("shows and announces a move of the displayed Chance by at least 0.1 point", () => {
    const feed = show([market({ id: "1", price: 0.62 })]);
    feed.pushMarket({ id: "1", price: 0.625 });
    expect(screen.getByRole("img", { name: "Yes 62.5% chance, No 37.5% chance" })).toBeInTheDocument();
    expect(screen.getByText("Question 1? up")).toBeInTheDocument();
  });

  it("neither shows nor announces a Price change too small to change the displayed Chance", () => {
    const feed = show([market({ id: "1", price: 0.62 })]);
    feed.pushMarket({ id: "1", price: 0.6204 });
    expect(screen.getByRole("img", { name: "Yes 62% chance, No 38% chance" })).toBeInTheDocument();
    expect(screen.queryByText(/Question 1\? (up|down)/)).not.toBeInTheDocument();
  });

  it("ignores updates for Markets that aren't followed", () => {
    const feed = show([market({ id: "1", price: 0.62 })]);
    feed.pushMarket({ id: "999", price: 0.1 });
    expect(screen.getByRole("img", { name: "Yes 62% chance, No 38% chance" })).toBeInTheDocument();
  });

  it("colours a move green or red only on a Yes/No Market", () => {
    const feed = show([market({ id: "1", price: 0.62 }), market({ id: "2", price: 0.4 })]);
    feed.pushMarket({ id: "1", price: 0.7 });
    feed.pushMarket({ id: "2", price: 0.3 });
    expect(screen.getByRole("img", { name: "Moved up" })).toHaveAttribute("data-tone", "up");
    expect(screen.getByRole("img", { name: "Moved down" })).toHaveAttribute("data-tone", "down");
  });

  it("keeps a move neutral on a Market between two teams", () => {
    const feed = show([market({ id: "1", outcomes: ["Hawks", "Pacers"], price: 0.62 })]);
    feed.pushMarket({ id: "1", price: 0.7 });
    expect(screen.getByRole("img", { name: "Moved up" })).toHaveAttribute("data-tone", "neutral");
  });

});

describe("Freshness on the live Watchlist", () => {
  const atNow = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  };

  it("says Live while the last ok Run is recent", () => {
    atNow();
    show([market({ id: "1" })]);
    expect(screen.getByRole("status")).toHaveTextContent("Live · updated");
  });

  it("turns Stale after 30 seconds without an ok Run, and Fresh again when one arrives", () => {
    atNow();
    const feed = show([market({ id: "1" })]);
    act(() => vi.advanceTimersByTime(31_000));
    expect(screen.getByRole("status")).toHaveTextContent("Chances may be out of date");
    feed.pushRun(run({ finished_at: new Date(Date.now()).toISOString() }));
    expect(screen.getByRole("status")).toHaveTextContent("Live · updated");
  });

  it("turns Stale while the live channel is lost", () => {
    atNow();
    const feed = show([market({ id: "1" })]);
    feed.setConnection("lost");
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…");
  });

  it("is Down when the latest non-skipped Run failed, with the error and a link to the run log", () => {
    atNow();
    show([market({ id: "1" })], [run({ ok: false, error: "CLOB timed out" }), run({ skipped: true })]);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Feed failing since");
    expect(alert).toHaveTextContent("CLOB timed out");
    expect(within(alert).getByRole("link", { name: "See the run log" })).toHaveAttribute("href", "/status");
  });
});

describe("reconnecting", () => {
  it("refetches the snapshot when the channel comes back, and shows what it returns", async () => {
    const feed = show([market({ id: "1", price: 0.62 })]);
    feed.snapshot = {
      follows: [{ created_at: "2026-11-01T00:00:00.000Z", markets: market({ id: "1", price: 0.8 }) }],
      runs: [run()],
    };
    feed.setConnection("lost");
    feed.setConnection("live");
    expect(feed.snapshotLoads).toBe(1);
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Yes 80% chance, No 20% chance" })).toBeInTheDocument(),
    );
  });
});

describe("Finished Markets", () => {
  it("are collapsed under Finished (n) after the live ones, with Clear finished", () => {
    show([
      market({ id: "1", question: "Live one?" }),
      market({ id: "2", question: "Ended one?", closed: true, closed_at: "2026-11-02T00:00:00.000Z" }),
    ]);
    const section = screen.getByText("Finished (1)").closest("details")!;
    expect(section).not.toHaveAttribute("open");
    expect(within(section).getByText("Ended one?")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Clear finished" })).toBeInTheDocument();
    expect(within(section).queryByText("Live one?")).not.toBeInTheDocument();
  });
});

describe("cards v2", () => {
  const IMAGE = "https://polymarket-upload.s3.us-east-2.amazonaws.com/BTC+fullsize.png";
  const chances = () => screen.getByRole("img", { name: /chance/ }).closest("[data-split]")!;
  const rolling = () => chances().querySelectorAll("[data-rolling]");

  it("shows the Market's image", () => {
    show([market({ id: "1", image: IMAGE })]);
    const thumb = screen.getByTestId("thumb-1");
    expect(thumb).toHaveAttribute("data-thumb", "image");
    expect(thumb.querySelector("img")!.getAttribute("src")).toContain(encodeURIComponent(IMAGE));
  });

  it("shows a placeholder for the Category when a Market has no image", () => {
    show([market({ id: "1", image: null, category: "finance" })]);
    expect(screen.getByTestId("thumb-1")).toHaveAttribute("data-thumb", "placeholder-finance");
  });

  it("rolls both Chances to their new values on a move of at least 0.1 point", () => {
    const feed = show([market({ id: "1", price: 0.62 })]);
    expect(rolling()).toHaveLength(0);
    feed.pushMarket({ id: "1", price: 0.65 });
    expect([...rolling()].map((el) => el.getAttribute("data-rolling"))).toEqual(["up", "down"]);
  });

  it("doesn't roll on a change too small to change the displayed Chance", () => {
    const feed = show([market({ id: "1", price: 0.62 })]);
    feed.pushMarket({ id: "1", price: 0.6203 });
    expect(rolling()).toHaveLength(0);
  });

  it("changes values without any animation when the viewer prefers reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const feed = show([market({ id: "1", price: 0.62 })]);
      feed.pushMarket({ id: "1", price: 0.65 });
      expect(screen.getByRole("img", { name: "Yes 65% chance, No 35% chance" })).toBeInTheDocument();
      expect(rolling()).toHaveLength(0);
      expect(chances()).toHaveAttribute("data-motion", "off");
    } finally {
      window.matchMedia = original;
    }
  });
});

