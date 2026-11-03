// The live Watchlist as a user sees it, with Supabase + Realtime replaced by a fake feed at its seam.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { recordVisit } from "@/app/actions/visits";
import { RecapScope } from "@/components/recap";
import { WatchlistFeedProvider } from "@/components/watchlist-feed";
import { WatchlistLive } from "@/components/watchlist-live";
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

