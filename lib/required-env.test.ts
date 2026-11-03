import { describe, expect, it } from "vitest";
import { checkRequiredEnv, REQUIRED_ENV } from "./required-env";

const all = Object.fromEntries(REQUIRED_ENV.map((name) => [name, "set"]));

describe("the build-time env check", () => {
  it("does nothing off Vercel, even with every variable missing", () => {
    expect(() => checkRequiredEnv({})).not.toThrow();
  });

  it("passes on Vercel when every required variable is set", () => {
    expect(() => checkRequiredEnv({ ...all, VERCEL: "1" })).not.toThrow();
  });

  it("fails on Vercel naming every missing or blank variable", () => {
    expect(() => checkRequiredEnv({ ...all, VERCEL: "1", CLERK_SECRET_KEY: " ", NEXT_PUBLIC_SUPABASE_URL: undefined }))
      .toThrow(/CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL/);
  });
});
