// UI tests: jest-dom matchers, a clean DOM after each test, and the Next.js / Server Action boundaries
// mocked, so components render without a Next server, Clerk or Supabase.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/actions/follows", () => ({
  follow: vi.fn(async () => ({ ok: true })),
  unfollow: vi.fn(async () => ({ ok: true })),
  clearFinished: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/app/actions/visits", () => ({
  recordVisit: vi.fn(async () => {}),
}));
