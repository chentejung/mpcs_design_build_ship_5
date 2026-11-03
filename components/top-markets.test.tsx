// The signed-out landing page's top Markets, rendered from props (the page reads them as anon).
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopMarkets } from "@/components/top-markets";
import type { Market } from "@/lib/markets";

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

describe("top Markets on the landing page", () => {
  it("shows each Market with its split, linking to its Category in Browse", () => {
    render(
      <TopMarkets
        markets={[
          market({ id: "1", question: "Who wins the Senate?", price: 0.62 }),
          market({ id: "2", question: "Hawks vs. Pacers", category: "sports", outcomes: ["Hawks", "Pacers"], price: 0.4 }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("img", { name: "Yes 62% chance, No 38% chance" })).toBeInTheDocument();
    expect(within(items[0]).getByRole("link", { name: /Who wins the Senate\?/ })).toHaveAttribute(
      "href",
      "/browse?category=politics",
    );
    expect(within(items[1]).getByRole("img", { name: "Hawks 40% chance, Pacers 60% chance" })).toBeInTheDocument();
    expect(within(items[1]).getByRole("link", { name: /Hawks vs\. Pacers/ })).toHaveAttribute(
      "href",
      "/browse?category=sports",
    );
  });

  it("names a Market under its Event", () => {
    render(
      <TopMarkets
        markets={[market({ id: "1", question: "Will the Democrats win?", event_title: "Senate control", group_item_title: "Democrats" })]}
      />,
    );
    expect(screen.getByText("Senate control")).toBeInTheDocument();
    expect(screen.getByText("Democrats")).toBeInTheDocument();
  });

  it("says so when there are no Markets yet", () => {
    render(<TopMarkets markets={[]} />);
    expect(screen.getByText("No Markets yet. The feed fills them in within a few minutes.")).toBeInTheDocument();
  });
});
