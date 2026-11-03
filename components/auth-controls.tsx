// Sign in / sign up when signed out, the user menu when signed in. <Show> reads the request, so it sits in
// <Suspense> (Cache Components).
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Suspense } from "react";

export function AuthControls() {
  return (
    <Suspense fallback={<div className="h-8 w-28" aria-hidden />}>
      <Show when="signed-out">
        <div className="flex items-center gap-2 text-sm">
          <SignInButton mode="modal">
            <button type="button" className="rounded-md px-3 py-1.5 text-dim hover:text-ink">Sign in</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button type="button" className="rounded-md bg-accent px-3 py-1.5 font-semibold text-on-accent hover:bg-accent-strong">
              Sign up
            </button>
          </SignUpButton>
        </div>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </Suspense>
  );
}
