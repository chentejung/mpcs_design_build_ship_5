// The live Watchlist as a user sees it, with Supabase + Realtime replaced by a fake feed at its seam.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlert, deleteAlert } from "@/app/actions/alerts";
import { recordVisit } from "@/app/actions/visits";
import { RecapScope } from "@/components/recap";
import { WatchlistFeedProvider } from "@/components/watchlist-feed";
import { WatchlistLive } from "@/components/watchlist-live";
import type { Alert } from "@/lib/alerts";
import type { Recap } from "@/lib/recap";
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

describe("heartbeat", () => {
  const atNow = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  };
  const heartbeat = () => screen.getByRole("img", { name: /^Feed / });

  it("says live and beats for the latest Run while the banner says Live", () => {
    atNow();
    show([market({ id: "1" })], [run({ id: 7 })]);
    expect(screen.getByRole("status")).toHaveTextContent("Live · updated");
    expect(heartbeat()).toHaveAccessibleName("Feed live");
    expect(heartbeat()).toHaveAttribute("data-state", "fresh");
    expect(heartbeat()).toHaveAttribute("data-beat", "7");
  });

  it("beats again for each new Run seen", () => {
    atNow();
    const feed = show([market({ id: "1" })], [run({ id: 7 })]);
    feed.pushRun(run({ id: 8 }));
    expect(heartbeat()).toHaveAttribute("data-beat", "8");
  });

  it("goes flat and Stale after 30 seconds, with the banner", () => {
    atNow();
    show([market({ id: "1" })]);
    act(() => vi.advanceTimersByTime(31_000));
    expect(screen.getByRole("status")).toHaveTextContent("Chances may be out of date");
    expect(heartbeat()).toHaveAccessibleName("Feed stale");
    expect(heartbeat()).toHaveAttribute("data-state", "stale");
    expect(heartbeat()).not.toHaveAttribute("data-beat");
  });

  it("goes flat and Stale while the live channel is lost, with the banner", () => {
    atNow();
    const feed = show([market({ id: "1" })]);
    feed.setConnection("lost");
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…");
    expect(heartbeat()).toHaveAccessibleName("Feed stale");
    expect(heartbeat()).toHaveAttribute("data-state", "stale");
  });

  it("is Down with the banner, and links to the run log", () => {
    atNow();
    show([market({ id: "1" })], [run({ ok: false, error: "CLOB timed out" })]);
    expect(screen.getByRole("alert")).toHaveTextContent("Feed failing since");
    expect(heartbeat()).toHaveAccessibleName("Feed down");
    expect(heartbeat()).toHaveAttribute("data-state", "down");
    expect(heartbeat()).not.toHaveAttribute("data-beat");
    expect(screen.getByRole("link", { name: "Feed down" })).toHaveAttribute("href", "/status");
  });

  it("is neutral while no Run has been seen", () => {
    show([market({ id: "1" })], []);
    expect(heartbeat()).toHaveAccessibleName("Feed loading");
    expect(heartbeat()).toHaveAttribute("data-state", "loading");
  });

  it("is a static indicator that still states Freshness when the viewer prefers reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      atNow();
      const feed = show([market({ id: "1" })], [run({ id: 7 })]);
      feed.pushRun(run({ id: 8 }));
      expect(heartbeat()).toHaveAccessibleName("Feed live");
      expect(heartbeat()).toHaveAttribute("data-state", "fresh");
      expect(heartbeat()).not.toHaveAttribute("data-beat");
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("sparkline and Δ", () => {
  // Only the clock is faked, so the page's refetch and waitFor still run.
  const atNow = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
  };
  const t = (iso: string) => new Date(iso).getTime();
  // 0.70 since the day before, 0.58 from 11:00, 0.60 from 11:30; the Price is now 0.62.
  const history = [
    { at: t("2026-11-02T09:00:00.000Z"), price: 0.7 },
    { at: t("2026-11-03T11:00:00.000Z"), price: 0.58 },
    { at: t("2026-11-03T11:30:00.000Z"), price: 0.6 },
  ];
  const sparkline = () => screen.getByRole("img", { name: /^Yes over 24 hours/ });

  it("shows the last 24 hours of the first Outcome and its Δ 1h / Δ 24h in Chance points", () => {
    atNow();
    show([market({ id: "1", price: 0.62, history })]);
    expect(sparkline()).toHaveAccessibleName("Yes over 24 hours: from 70 to 62");
    expect(screen.getByText("Δ 1h +4.0")).toBeInTheDocument();
    expect(screen.getByText("Δ 24h −8.0")).toBeInTheDocument();
  });

  it("shows a dash when there isn't enough history", () => {
    atNow();
    show([market({ id: "1", price: 0.62, history: [{ at: t("2026-11-03T11:30:00.000Z"), price: 0.6 }] })]);
    expect(screen.getByText("Δ 1h —")).toBeInTheDocument();
    expect(screen.getByText("Δ 24h —")).toBeInTheDocument();
  });

  it("extends the sparkline and changes Δ when a pushed update changes the Price", () => {
    atNow();
    const feed = show([market({ id: "1", price: 0.62, history })]);
    expect(sparkline()).toHaveAttribute("data-points", "3");
    feed.pushMarket({ id: "1", price: 0.65, price_changed_at: NOW });
    expect(sparkline()).toHaveAccessibleName("Yes over 24 hours: from 70 to 65");
    expect(sparkline()).toHaveAttribute("data-points", "4");
    expect(screen.getByText("Δ 1h +7.0")).toBeInTheDocument();
    expect(screen.getByText("Δ 24h −5.0")).toBeInTheDocument();
  });

  it("doesn't add a point for an update that leaves the Price unchanged", () => {
    atNow();
    const feed = show([market({ id: "1", price: 0.62, history })]);
    feed.pushMarket({ id: "1", price: 0.62, volume_24h: 2000 });
    expect(sparkline()).toHaveAttribute("data-points", "3");
  });

  it("replaces the history from the snapshot refetched after a reconnect", async () => {
    atNow();
    const feed = show([market({ id: "1", price: 0.62, history })]);
    feed.snapshot = {
      follows: [{
        created_at: "2026-11-01T00:00:00.000Z",
        markets: {
          ...market({ id: "1", price: 0.5 }),
          recent: [{ price: 0.5, recorded_at: "2026-11-03T11:50:00.000Z" }],
          before: [{ price: 0.4, recorded_at: "2026-11-02T08:00:00.000Z" }],
        },
      }],
      runs: [run()],
    };
    feed.setConnection("lost");
    feed.setConnection("live");
    await waitFor(() => expect(sparkline()).toHaveAccessibleName("Yes over 24 hours: from 40 to 50"));
    expect(sparkline()).toHaveAttribute("data-points", "2");
    expect(screen.getByText("Δ 1h +10.0")).toBeInTheDocument();
    expect(screen.getByText("Δ 24h +10.0")).toBeInTheDocument();
  });

  it("shows a Finished Market's frozen history, as of when trading ended", () => {
    atNow();
    show([market({
      id: "1", price: 0.99, closed: true, closed_at: "2026-11-03T11:00:00.000Z",
      history: [{ at: t("2026-11-03T09:00:00.000Z"), price: 0.8 }, { at: t("2026-11-03T10:59:00.000Z"), price: 0.99 }],
    })]);
    const section = screen.getByText("Finished (1)").closest("details")!;
    expect(within(section).getByRole("img", { name: "Yes over 24 hours: from 80 to 99" })).toBeInTheDocument();
    expect(within(section).getByText("Δ 1h +19.0")).toBeInTheDocument();
  });

  it("draws in", () => {
    atNow();
    show([market({ id: "1", price: 0.62, history })]);
    expect(sparkline()).toHaveAttribute("data-motion", "on");
  });

  it("doesn't draw in when the viewer prefers reduced motion", () => {
    atNow();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      show([market({ id: "1", price: 0.62, history })]);
      expect(sparkline()).toHaveAttribute("data-motion", "off");
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("alerts", () => {
  const alertRow = (over: Partial<Alert> & { id: number; market_id: string }): Alert => ({
    direction: "above",
    threshold: 0.6,
    created_at: "2026-11-03T11:00:00.000Z",
    triggered_at: null,
    triggered_price: null,
    ...over,
  });

  function showWithAlerts(items: Followed[], alerts: Alert[], feed: FakeFeed = fakeFeed()) {
    render(
      <WatchlistFeedProvider value={feed.useFeed}>
        <WatchlistLive initialItems={items} initialRuns={[run()]} initialAlerts={alerts} renderedAt={NOW} />
      </WatchlistFeedProvider>,
    );
    return feed;
  }
  const alertLines = () => [...document.querySelectorAll("[data-alert-line]")].map((el) => el.getAttribute("data-alert-line"));

  function setAlert(label: string, direction: "above" | "below", chance: string) {
    fireEvent.click(screen.getByRole("button", { name: `Add alert on ${label}` }));
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: direction } });
    fireEvent.change(screen.getByLabelText("Chance (%)"), { target: { value: chance } });
    fireEvent.click(screen.getByRole("button", { name: "Set alert" }));
  }

  beforeEach(() => {
    vi.mocked(createAlert).mockClear();
    vi.mocked(deleteAlert).mockClear();
  });

  it("adds an alert from a card through the Server Action and draws it as a dashed line on the bar", async () => {
    showWithAlerts([market({ id: "1", price: 0.5 })], []);
    setAlert("Question 1?", "above", "60");
    await waitFor(() => expect(screen.getByText("Yes above 60%")).toBeInTheDocument());
    expect(createAlert).toHaveBeenCalledWith({ marketId: "1", direction: "above", chance: 60 });
    expect(alertLines()).toEqual(["0.6"]);
  });

  it("names the first Outcome on a Market between two teams", async () => {
    showWithAlerts([market({ id: "1", outcomes: ["Hawks", "Pacers"], price: 0.5 })], []);
    setAlert("Question 1?", "below", "40");
    await waitFor(() => expect(screen.getByText("Hawks below 40%")).toBeInTheDocument());
  });

  it("warns before creating an alert the Price is already past", async () => {
    showWithAlerts([market({ id: "1", price: 0.62 })], []);
    setAlert("Question 1?", "above", "60");
    expect(screen.getByRole("alert")).toHaveTextContent("Yes is already above 60%");
    expect(createAlert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Set anyway" }));
    await waitFor(() => expect(screen.getByText("Yes above 60%")).toBeInTheDocument());
    expect(createAlert).toHaveBeenCalledTimes(1);
  });

  it("shows the Server Action's message when the alert can't be set", async () => {
    vi.mocked(createAlert).mockResolvedValueOnce({ ok: false, message: "Alert limit reached (3 per Market). Delete one to add another." });
    showWithAlerts([market({ id: "1", price: 0.5 })], []);
    setAlert("Question 1?", "above", "70");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Alert limit reached (3 per Market)"));
    expect(alertLines()).toEqual([]);
  });

  it("shows a triggered alert from the snapshot refetch as Alert hit, listed under Triggered", async () => {
    const m = market({ id: "1", price: 0.5 });
    const feed = showWithAlerts([m], [alertRow({ id: 7, market_id: "1" })]);
    expect(alertLines()).toEqual(["0.6"]);
    expect(screen.queryByText("Alert hit")).not.toBeInTheDocument();

    feed.snapshot = {
      follows: [{ created_at: m.followed_at, markets: market({ id: "1", price: 0.65 }) }],
      runs: [run()],
      alerts: [alertRow({ id: 7, market_id: "1", triggered_at: "2026-11-03T11:58:00.000Z", triggered_price: 0.65 })],
    };
    feed.setConnection("lost");
    feed.setConnection("live");

    await waitFor(() => expect(screen.getByText("Alert hit")).toBeInTheDocument());
    const triggered = screen.getByRole("region", { name: "Triggered" });
    expect(within(triggered).getByText("Yes above 60%")).toBeInTheDocument();
    expect(within(triggered).getByText(/hit at 65%/)).toBeInTheDocument();
    expect(alertLines()).toEqual([]);
  });

  it("deletes an alert through the Server Action and removes it", async () => {
    showWithAlerts(
      [market({ id: "1", price: 0.5 })],
      [
        alertRow({ id: 7, market_id: "1", triggered_at: "2026-11-03T11:58:00.000Z", triggered_price: 0.65 }),
        alertRow({ id: 8, market_id: "1", direction: "below", threshold: 0.3 }),
      ],
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete alert Yes above 60% on Question 1?" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Triggered" })).not.toBeInTheDocument());
    expect(deleteAlert).toHaveBeenCalledWith(7);
    expect(screen.queryByText("Alert hit")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete alert Yes below 30% on Question 1?" }));
    await waitFor(() => expect(alertLines()).toEqual([]));
    expect(deleteAlert).toHaveBeenCalledWith(8);
  });
});



describe("heatmap", () => {
  const atNow = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
  };
  const t = (iso: string) => new Date(iso).getTime();
  const heatmap = () => screen.getByRole("list", { name: "Heatmap" });
  const toHeatmap = () => fireEvent.click(screen.getByRole("button", { name: "Heatmap" }));
  // One point an hour and a half ago, so Δ 1h is the current Price minus it.
  const rising = [{ at: t("2026-11-03T10:30:00.000Z"), price: 0.6 }];
  const falling = [{ at: t("2026-11-03T10:30:00.000Z"), price: 0.7 }];

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("switches between Cards and Heatmap with a labelled toggle", () => {
    show([market({ id: "1" })]);
    const toggle = screen.getByRole("group", { name: "Watchlist view" });
    expect(within(toggle).getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("list", { name: "Heatmap" })).not.toBeInTheDocument();
    toHeatmap();
    expect(within(toggle).getByRole("button", { name: "Heatmap" })).toHaveAttribute("aria-pressed", "true");
    expect(heatmap()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unfollow Question 1?" })).not.toBeInTheDocument();
    fireEvent.click(within(toggle).getByRole("button", { name: "Cards" }));
    expect(screen.queryByRole("list", { name: "Heatmap" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unfollow Question 1?" })).toBeInTheDocument();
  });

  it("remembers the chosen view", () => {
    show([market({ id: "1" })]);
    toHeatmap();
    cleanup();
    show([market({ id: "1" })]);
    expect(heatmap()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Heatmap" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows each live Market's label, first Outcome's Chance and Δ 1h, and leaves Finished ones out", () => {
    atNow();
    show([
      market({ id: "1", question: "Live one?", price: 0.624, history: rising }),
      market({ id: "2", question: "Ended one?", closed: true, closed_at: "2026-11-02T00:00:00.000Z" }),
    ]);
    toHeatmap();
    const tiles = within(heatmap()).getAllByRole("button");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toHaveAccessibleName("Live one?: Yes 62.4%, Δ 1h +2.4");
    expect(tiles[0]).toHaveTextContent("Live one?");
    expect(tiles[0]).toHaveTextContent("Yes 62.4%");
  });

  it("shades a Yes/No Market up or down by its Δ 1h", () => {
    atNow();
    show([
      market({ id: "1", question: "Rising?", price: 0.62, history: rising }),
      market({ id: "2", question: "Falling?", price: 0.62, history: falling }),
    ]);
    toHeatmap();
    expect(screen.getByRole("button", { name: "Rising?: Yes 62%, Δ 1h +2.0" })).toHaveAttribute("data-tone", "up");
    expect(screen.getByRole("button", { name: "Falling?: Yes 62%, Δ 1h −8.0" })).toHaveAttribute("data-tone", "down");
  });

  it("keeps a Market between two teams neutral", () => {
    atNow();
    show([market({ id: "1", question: "Hawks vs. Pacers", outcomes: ["Hawks", "Pacers"], price: 0.62, history: rising })]);
    toHeatmap();
    expect(screen.getByRole("button", { name: "Hawks vs. Pacers: Hawks 62%, Δ 1h +2.0" }))
      .toHaveAttribute("data-tone", "neutral");
  });

  it("is flat without enough history or without a move", () => {
    atNow();
    show([
      market({ id: "1", question: "New?", price: 0.62 }),
      market({ id: "2", question: "Still?", price: 0.6, history: rising }),
    ]);
    toHeatmap();
    expect(screen.getByRole("button", { name: "New?: Yes 62%, Δ 1h —" })).toHaveAttribute("data-tone", "flat");
    expect(screen.getByRole("button", { name: "Still?: Yes 60%, Δ 1h 0.0" })).toHaveAttribute("data-tone", "flat");
  });

  it("sizes tiles by 24-hour volume", () => {
    show([
      market({ id: "1", question: "Big?", volume_24h: 1_000_000 }),
      market({ id: "2", question: "Mid?", volume_24h: 200_000 }),
      market({ id: "3", question: "Small?", volume_24h: 5_000 }),
      market({ id: "4", question: "None?", volume_24h: null }),
    ]);
    toHeatmap();
    expect(screen.getByRole("button", { name: /^Big\?/ })).toHaveAttribute("data-size", "lg");
    expect(screen.getByRole("button", { name: /^Mid\?/ })).toHaveAttribute("data-size", "md");
    expect(screen.getByRole("button", { name: /^Small\?/ })).toHaveAttribute("data-size", "sm");
    expect(screen.getByRole("button", { name: /^None\?/ })).toHaveAttribute("data-size", "sm");
  });

  it("updates a tile's Chance and tone from a pushed update", () => {
    atNow();
    const feed = show([market({ id: "1", question: "Live one?", price: 0.6, history: rising })]);
    toHeatmap();
    expect(screen.getByRole("button", { name: "Live one?: Yes 60%, Δ 1h 0.0" })).toHaveAttribute("data-tone", "flat");
    feed.pushMarket({ id: "1", price: 0.55, price_changed_at: NOW });
    const tile = screen.getByRole("button", { name: "Live one?: Yes 55%, Δ 1h −5.0" });
    expect(tile).toHaveTextContent("Yes 55%");
    expect(tile).toHaveAttribute("data-tone", "down");
  });

  it("shows a Market's card details when its tile is activated, and hides them again", () => {
    show([market({ id: "1", question: "First?" }), market({ id: "2", question: "Second?" })]);
    toHeatmap();
    const tile = screen.getByRole("button", { name: /^Second\?/ });
    expect(tile).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(tile);
    expect(tile).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByRole("region", { name: "Second? details" });
    expect(within(details).getByRole("button", { name: "Unfollow Second?" })).toBeInTheDocument();
    expect(within(details).getByRole("img", { name: "Yes 62% chance, No 38% chance" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unfollow First?" })).not.toBeInTheDocument();
    fireEvent.click(within(details).getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("region", { name: "Second? details" })).not.toBeInTheDocument();
  });

  it("has no transitions on tiles when the viewer prefers reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      show([market({ id: "1", question: "Live one?" })]);
      toHeatmap();
      expect(screen.getByRole("button", { name: /^Live one\?/ })).toHaveAttribute("data-motion", "off");
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("recap", () => {
  const LAST = "2026-11-03T08:00:00.000Z";
  const moved = (over: Partial<Extract<Recap, { kind: "moved" }>> = {}): Recap => ({
    kind: "moved",
    since: LAST,
    capped: false,
    entries: [
      { id: "1", label: "Question 1?", outcomes: ["Yes", "No"], from: 0.5, to: 0.62, points: 12, dir: "up" },
      { id: "2", label: "Question 2?", outcomes: ["Hawks", "Pacers"], from: 0.45, to: 0.3, points: -15, dir: "down" },
    ],
    finished: [],
    ...over,
  });
  const items = () => [
    market({ id: "1", price: 0.62 }),
    market({ id: "2", price: 0.3, outcomes: ["Hawks", "Pacers"] }),
  ];
  function showRecap(r: Recap, list: Followed[] = items()) {
    const feed = fakeFeed();
    render(
      <RecapScope recap={r}>
        <WatchlistFeedProvider value={feed.useFeed}>
          <WatchlistLive initialItems={list} initialRuns={[run()]} renderedAt={NOW} />
        </WatchlistFeedProvider>
      </RecapScope>,
    );
  }
  const NAME = /since your last visit|nothing big moved/i;
  const panel = () => screen.getByRole("region", { name: NAME });
  const reducedMotion = () => {
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
  };

  it("lists the Markets that moved, from → to, with direction coloured only on Yes/No", () => {
    showRecap(moved());
    const region = panel();
    expect(within(region).getByRole("heading", { name: /^Since your last visit/ })).toBeInTheDocument();
    const yes = within(region).getByText("Question 1?").closest("li")!;
    expect(yes).toHaveTextContent("Yes 50 → 62");
    expect(within(yes).getByRole("img", { name: "Up 12 points" })).toHaveAttribute("data-tone", "up");
    const teams = within(region).getByText("Question 2?").closest("li")!;
    expect(teams).toHaveTextContent("Hawks 45 → 30");
    expect(within(teams).getByRole("img", { name: "Down 15 points" })).toHaveAttribute("data-tone", "neutral");
    expect(within(region).getByRole("button", { name: "Replay the moves" })).toBeInTheDocument();
  });

  it("includes Markets that became Finished since the last visit", () => {
    showRecap(moved({
      entries: [],
      finished: [{ id: "3", label: "Ended one?", outcomes: ["Yes", "No"], from: 0.8, to: 0.99, points: 19, dir: "up" }],
    }));
    const ended = within(panel()).getByText("Ended one?").closest("li")!;
    expect(ended).toHaveTextContent("Finished");
    expect(ended).toHaveTextContent("Yes 80 → 99");
  });

  it("says nothing big moved when it was quiet, without a Replay", () => {
    showRecap({ kind: "quiet", since: LAST, capped: false });
    expect(within(panel()).getByRole("heading", { name: /^Nothing big moved since/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replay the moves" })).not.toBeInTheDocument();
  });

  it("says it covers only the last 7 days when the last visit is older", () => {
    showRecap(moved({ capped: true }));
    expect(panel()).toHaveTextContent("Covers only the last 7 days");
  });

  it("shows nothing on a first visit", () => {
    showRecap({ kind: "none" });
    expect(screen.queryByRole("region", { name: NAME })).not.toBeInTheDocument();
  });

  it("can be dismissed", () => {
    showRecap(moved());
    act(() => within(panel()).getByRole("button", { name: "Dismiss the recap" }).click());
    expect(screen.queryByRole("region", { name: NAME })).not.toBeInTheDocument();
  });

  it("records this visit once, after the page has read the previous one", () => {
    vi.mocked(recordVisit).mockClear();
    showRecap(moved());
    expect(recordVisit).toHaveBeenCalledTimes(1);
  });

  it("replays each bar from its old split to the current one", () => {
    showRecap(moved());
    const bar = () => panel().querySelector("[data-recap-bar='1']")!;
    expect(bar()).toHaveAttribute("data-at", "to");
    act(() => within(panel()).getByRole("button", { name: "Replay the moves" }).click());
    expect(panel()).toHaveAttribute("data-replay");
    expect(bar()).toHaveAttribute("data-at", "from");
  });

  it("replays instantly when the viewer prefers reduced motion", () => {
    const restore = reducedMotion();
    try {
      showRecap(moved());
      act(() => within(panel()).getByRole("button", { name: "Replay the moves" }).click());
      expect(panel()).not.toHaveAttribute("data-replay");
      expect(panel().querySelector("[data-recap-bar='1']")).toHaveAttribute("data-at", "to");
    } finally {
      restore();
    }
  });
});

describe("live alert toast", () => {
  const alertRow = (over: Partial<Alert> & { id: number; market_id: string }): Alert => ({
    direction: "above",
    threshold: 0.6,
    created_at: "2026-11-03T11:00:00.000Z",
    triggered_at: null,
    triggered_price: null,
    ...over,
  });
  function showWithAlerts(items: Followed[], alerts: Alert[], feed: FakeFeed = fakeFeed()) {
    render(
      <WatchlistFeedProvider value={feed.useFeed}>
        <WatchlistLive initialItems={items} initialRuns={[run()]} initialAlerts={alerts} renderedAt={NOW} />
      </WatchlistFeedProvider>,
    );
    return feed;
  }
  const toasts = () => {
    const region = screen.getByRole("region", { name: "Alert notifications" });
    expect(region).toHaveAttribute("aria-live", "polite");
    return region;
  };
  const toastText = "Alert hit: Yes above 60% on Question 1? — now 65%";
  const sparkLines = () =>
    [...screen.getByRole("img", { name: /^Yes over 24 hours/ }).querySelectorAll("[data-spark-alert-line]")]
      .map((el) => el.getAttribute("data-spark-alert-line"));

  it("shows a toast and the Alert hit badge as soon as a pushed update crosses an alert", () => {
    const feed = showWithAlerts([market({ id: "1", price: 0.55 })], [alertRow({ id: 7, market_id: "1" })]);
    expect(within(toasts()).queryByText(/Alert hit/)).not.toBeInTheDocument();
    feed.pushMarket({ id: "1", price: 0.65, price_changed_at: NOW });
    expect(within(toasts()).getByText(toastText)).toBeInTheDocument();
    expect(screen.getByText("Alert hit")).toBeInTheDocument();
    const triggered = screen.getByRole("region", { name: "Triggered" });
    expect(within(triggered).getByText("Yes above 60%")).toBeInTheDocument();
  });

  it("names a below alert on a team Market and the Chance it reached", () => {
    const feed = showWithAlerts(
      [market({ id: "1", outcomes: ["Hawks", "Pacers"], price: 0.45 })],
      [alertRow({ id: 7, market_id: "1", direction: "below", threshold: 0.4 })],
    );
    feed.pushMarket({ id: "1", price: 0.4, price_changed_at: NOW });
    expect(within(toasts()).getByText("Alert hit: Hawks below 40% on Question 1? — now 40%")).toBeInTheDocument();
  });

  it("shows nothing for an update that doesn't cross an alert", () => {
    const feed = showWithAlerts([market({ id: "1", price: 0.5 })], [alertRow({ id: 7, market_id: "1" })]);
    feed.pushMarket({ id: "1", price: 0.59, price_changed_at: NOW });
    expect(within(toasts()).queryByText(/Alert hit/)).not.toBeInTheDocument();
    expect(screen.queryByText("Alert hit")).not.toBeInTheDocument();
  });

  it("can be dismissed", () => {
    const feed = showWithAlerts([market({ id: "1", price: 0.55 })], [alertRow({ id: 7, market_id: "1" })]);
    feed.pushMarket({ id: "1", price: 0.65, price_changed_at: NOW });
    fireEvent.click(within(toasts()).getByRole("button", { name: "Dismiss" }));
    expect(within(toasts()).queryByText(toastText)).not.toBeInTheDocument();
    expect(screen.getByText("Alert hit")).toBeInTheDocument();
  });

  it("hides on its own after a few seconds", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date(NOW));
    const feed = showWithAlerts([market({ id: "1", price: 0.55 })], [alertRow({ id: 7, market_id: "1" })]);
    feed.pushMarket({ id: "1", price: 0.65, price_changed_at: NOW });
    act(() => vi.advanceTimersByTime(5_000));
    expect(within(toasts()).getByText(toastText)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2_000));
    expect(within(toasts()).queryByText(toastText)).not.toBeInTheDocument();
  });

  it("doesn't toast again when the refetched snapshot confirms the stored trigger", async () => {
    const m = market({ id: "1", price: 0.55 });
    const feed = showWithAlerts([m], [alertRow({ id: 7, market_id: "1" })]);
    feed.pushMarket({ id: "1", price: 0.65, price_changed_at: NOW });
    fireEvent.click(within(toasts()).getByRole("button", { name: "Dismiss" }));

    feed.snapshot = {
      follows: [{ created_at: m.followed_at, markets: market({ id: "1", price: 0.66 }) }],
      runs: [run()],
      alerts: [alertRow({ id: 7, market_id: "1", triggered_at: "2026-11-03T11:59:58.000Z", triggered_price: 0.65 })],
    };
    const loads = feed.snapshotLoads;
    feed.setConnection("lost");
    feed.setConnection("live");
    await waitFor(() => expect(feed.snapshotLoads).toBe(loads + 1));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Triggered" })).getByText(/hit at 65%/)).toBeInTheDocument());
    feed.pushMarket({ id: "1", price: 0.7, price_changed_at: NOW });
    expect(within(toasts()).queryByText(/Alert hit/)).not.toBeInTheDocument();
    expect(screen.getByText("Alert hit")).toBeInTheDocument();
  });

  it("keeps the local trigger, and doesn't toast again, if a refetch comes before the worker stored it", async () => {
    const m = market({ id: "1", price: 0.55 });
    const feed = showWithAlerts([m], [alertRow({ id: 7, market_id: "1" })]);
    feed.pushMarket({ id: "1", price: 0.65, price_changed_at: NOW });
    fireEvent.click(within(toasts()).getByRole("button", { name: "Dismiss" }));

    feed.snapshot = {
      follows: [{ created_at: m.followed_at, markets: market({ id: "1", price: 0.65 }) }],
      runs: [run()],
      alerts: [alertRow({ id: 7, market_id: "1" })],
    };
    const loads = feed.snapshotLoads;
    feed.setConnection("lost");
    feed.setConnection("live");
    await waitFor(() => expect(feed.snapshotLoads).toBe(loads + 1));
    await waitFor(() => expect(screen.getByText("Alert hit")).toBeInTheDocument());
    feed.pushMarket({ id: "1", price: 0.7, price_changed_at: NOW });
    expect(within(toasts()).queryByText(/Alert hit/)).not.toBeInTheDocument();
  });

  it("slides in, but not when the viewer prefers reduced motion", () => {
    const feed = showWithAlerts([market({ id: "1", price: 0.55 })], [alertRow({ id: 7, market_id: "1" })]);
    feed.pushMarket({ id: "1", price: 0.65, price_changed_at: NOW });
    expect(within(toasts()).getByText(toastText).closest("[data-motion]")).toHaveAttribute("data-motion", "on");
    cleanup();

    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const again = showWithAlerts([market({ id: "1", price: 0.55 })], [alertRow({ id: 7, market_id: "1" })]);
      again.pushMarket({ id: "1", price: 0.65, price_changed_at: NOW });
      expect(within(toasts()).getByText(toastText).closest("[data-motion]")).toHaveAttribute("data-motion", "off");
    } finally {
      window.matchMedia = original;
    }
  });

  it("draws each active alert as a dashed line on the sparkline, and drops it once hit", () => {
    const feed = showWithAlerts(
      [market({ id: "1", price: 0.55 })],
      [
        alertRow({ id: 7, market_id: "1" }),
        alertRow({ id: 8, market_id: "1", direction: "below", threshold: 0.3 }),
        alertRow({ id: 9, market_id: "1", threshold: 0.9, triggered_at: "2026-11-03T10:00:00.000Z", triggered_price: 0.9 }),
      ],
    );
    expect(sparkLines()).toEqual(["0.6", "0.3"]);
    feed.pushMarket({ id: "1", price: 0.65, price_changed_at: NOW });
    expect(sparkLines()).toEqual(["0.3"]);
  });
});

