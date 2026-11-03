// The main nav: every page's link, in order, with the current page marked for screen readers.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteNavLinks } from "@/components/site-nav";

const links = () => within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link");
const current = () => links().filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent);

describe("main nav", () => {
  it("links Explore first, then Watchlist, Browse and Status when signed in", () => {
    render(<SiteNavLinks path="/" signedIn />);
    expect(links().map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Explore", "/explore"],
      ["Watchlist", "/"],
      ["Browse", "/browse"],
      ["Status", "/status"],
    ]);
  });

  it("marks Explore as the current page on /explore, and only Explore", () => {
    render(<SiteNavLinks path="/explore" signedIn />);
    expect(current()).toEqual(["Explore"]);
  });

  it("marks Watchlist only on / and Browse on its sub-URLs", () => {
    const { unmount } = render(<SiteNavLinks path="/" signedIn />);
    expect(current()).toEqual(["Watchlist"]);
    unmount();
    render(<SiteNavLinks path="/browse" signedIn />);
    expect(current()).toEqual(["Browse"]);
  });

  it("marks nothing while the path isn't known", () => {
    render(<SiteNavLinks path={null} signedIn />);
    expect(current()).toEqual([]);
  });

  it("shows no Watchlist to a signed-out visitor", () => {
    render(<SiteNavLinks path="/" signedIn={false} />);
    expect(links().map((a) => a.textContent)).toEqual(["Explore", "Browse", "Status"]);
  });

  it("shows no Watchlist while it isn't known whether anyone is signed in", () => {
    render(<SiteNavLinks path={null} />);
    expect(links().map((a) => a.textContent)).toEqual(["Explore", "Browse", "Status"]);
  });
});
