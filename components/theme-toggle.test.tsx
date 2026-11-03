// The theme toggle as a user meets it: one labelled button in the header that switches light ↔ dark,
// remembers the choice, and starts from the remembered one.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_SCRIPT, ThemeToggle } from "@/components/theme-toggle";

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().classList.remove("dark");
});

describe("theme toggle", () => {
  it("starts light, and switches the whole page to dark", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("button", { name: "Dark theme" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(root()).toHaveClass("dark");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("remembers the choice", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(localStorage.getItem("theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(localStorage.getItem("theme")).toBe("light");
    expect(root()).not.toHaveClass("dark");
  });

  it("starts from the theme the page loaded in", () => {
    // The no-flash script has already applied the saved theme before React renders.
    root().classList.add("dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is applied before paint from the saved choice, and light when none is saved", () => {
    const runHeadScript = () => new Function(THEME_SCRIPT)();
    runHeadScript();
    expect(root()).not.toHaveClass("dark");
    localStorage.setItem("theme", "dark");
    runHeadScript();
    expect(root()).toHaveClass("dark");
  });
});
