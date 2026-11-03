// The main nav: every page's link, in order, with the current page marked for screen readers.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteNavLinks } from "@/components/site-nav";

const links = () => within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link");
const current = () => links().filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent);

describe("main nav", () => {
  it("links Watchlist, Browse, Explore and Status, in that order", () => {
    render(<SiteNavLinks path="/" />);
    expect(links().map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Watchlist", "/"],
      ["Browse", "/browse"],
      ["Explore", "/explore"],
      ["Status", "/status"],
    ]);
  });

  it("marks Explore as the current page on /explore, and only Explore", () => {
    render(<SiteNavLinks path="/explore" />);
    expect(current()).toEqual(["Explore"]);
  });

  it("marks Watchlist only on / and Browse on its sub-URLs", () => {
    const { unmount } = render(<SiteNavLinks path="/" />);
    expect(current()).toEqual(["Watchlist"]);
    unmount();
    render(<SiteNavLinks path="/browse" />);
    expect(current()).toEqual(["Browse"]);
  });

  it("marks nothing while the path isn't known", () => {
    render(<SiteNavLinks path={null} />);
    expect(current()).toEqual([]);
  });
});
