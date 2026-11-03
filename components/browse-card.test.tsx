// Browse as a user sees it: the Category tabs and one Market's card, rendered from props (no Supabase).
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrowseCard } from "@/components/browse-card";
import { CategoryTabs } from "@/components/category-tabs";
import type { Market } from "@/lib/markets";

// Signed out, Follow is wrapped in Clerk's sign-in button; render its child without a Clerk app.
vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

const NOW = new Date("2026-11-03T12:00:00.000Z");

function market(over: Partial<Market> = {}): Market {
  return {
    id: "42",
    question: "Will it rain in Chicago tomorrow?",
    slug: "rain-chicago",
    image: null,
    category: "politics",
    event_id: null,
    event_title: null,
    group_item_title: null,
    outcomes: ["Yes", "No"],
    price: 0.62,
    price_changed_at: "2026-11-03T11:57:00.000Z",
    volume_24h: 1_250_000,
    end_date: "2026-11-06T12:00:00.000Z",
    closed: false,
    closed_at: null,
    ...over,
  };
}

function card(over: Partial<Market> = {}, viewer: { followed?: boolean; signedIn?: boolean } = {}) {
  render(
    <ul>
      <BrowseCard
        market={market(over)}
        now={NOW}
        muted={false}
        followed={viewer.followed ?? false}
        signedIn={viewer.signedIn ?? true}
        returnTo="/browse?category=politics"
      />
    </ul>,
  );
}

describe("Category tabs", () => {
  it("lists all seven Categories and marks the current one", () => {
    render(<CategoryTabs current="sports" />);
    const nav = screen.getByRole("navigation", { name: "Category" });
    const tabs = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent?.trim());
    expect(tabs).toEqual(["Politics", "Sports", "Crypto", "Finance", "Tech", "World", "Culture"]);
    expect(screen.getByRole("link", { name: "Sports" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Politics" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Culture" })).toHaveAttribute("href", "/browse?category=culture");
  });

  it("gives each Category an icon", () => {
    render(<CategoryTabs current="politics" />);
    for (const slug of ["politics", "sports", "crypto", "finance", "tech", "world", "culture"]) {
      expect(screen.getByTestId(`tab-icon-${slug}`)).toBeInTheDocument();
    }
  });
});

describe("Browse card", () => {
  it("shows the Market's name, both Outcomes as a split, volume, Moved and the Polymarket link", () => {
    card();
    expect(screen.getByText("Will it rain in Chicago tomorrow?")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Yes 62% chance, No 38% chance" })).toBeInTheDocument();
    expect(screen.getByText("$1.3M 24h")).toBeInTheDocument();
    expect(screen.getByText("Moved 3 min ago")).toBeInTheDocument();
    expect(screen.getByText("Ends in 3 d")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Polymarket/ })).toHaveAttribute(
      "href",
      "https://polymarket.com/market/rain-chicago",
    );
  });

  it("offers Follow to a signed-in viewer who doesn't follow the Market", () => {
    card({}, { signedIn: true, followed: false });
    const button = screen.getByRole("button", { name: "Follow Will it rain in Chicago tomorrow?" });
    expect(button).toHaveTextContent("Follow");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("shows Following to a signed-in viewer who follows the Market", () => {
    card({}, { signedIn: true, followed: true });
    const button = screen.getByRole("button", { name: "Unfollow Will it rain in Chicago tomorrow?" });
    expect(button).toHaveTextContent("Following");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("offers a signed-out visitor a Follow that leads to sign-in", () => {
    card({}, { signedIn: false });
    const button = screen.getByRole("button", { name: "Follow Will it rain in Chicago tomorrow?" });
    expect(button).toHaveTextContent("Follow");
    expect(button).not.toHaveAttribute("aria-pressed");
  });

  it("marks a Sports Market past its end date as In play", () => {
    card({ category: "sports", outcomes: ["Hawks", "Pacers"], end_date: "2026-11-03T11:00:00.000Z" });
    expect(screen.getByText(/In play/)).toBeInTheDocument();
  });

  it("marks any other Market past its end date as Still trading", () => {
    card({ category: "crypto", end_date: "2026-11-03T11:00:00.000Z" });
    expect(screen.getByText("Still trading")).toBeInTheDocument();
  });

  it("shows a Category placeholder when the Market has no image", () => {
    card({ category: "culture", image: null });
    expect(screen.getByTestId("thumb-42")).toHaveAttribute("data-thumb", "placeholder-culture");
  });

  it("shows the Market's image when it has one", () => {
    card({ image: "https://polymarket-upload.s3.us-east-2.amazonaws.com/rain.png" });
    expect(screen.getByTestId("thumb-42")).toHaveAttribute("data-thumb", "image");
  });

  it("names the Market by its group item under an Event heading", () => {
    card({ event_id: "e1", event_title: "Who wins?", group_item_title: "Democratic Party" });
    expect(screen.getByText("Democratic Party")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Follow Democratic Party" })).toBeInTheDocument();
  });
});
