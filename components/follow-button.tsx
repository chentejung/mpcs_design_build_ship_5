"use client";
// Follow / Following on Browse (product rules 1, 4, 7). Signed in, it toggles at once and rolls back if the
// write fails ("Watchlist full (25)"). Signed out, it opens Clerk's sign-in, which returns to
// /browse?follow=<id>; FollowAfterSignIn then follows that Market once.
import { SignInButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { follow, unfollow } from "@/app/actions/follows";

const base = "shrink-0 rounded-md border px-3 py-1 text-xs font-semibold";

export function FollowButton({
  marketId,
  label,
  followed,
  signedIn,
  returnTo,
}: {
  marketId: string;
  label: string;
  followed: boolean;
  signedIn: boolean;
  /** This Browse page's URL, to come back to after sign-in. */
  returnTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(followed);
  const [message, setMessage] = useState<string | null>(null);

  if (!signedIn) {
    const back = `${returnTo}${returnTo.includes("?") ? "&" : "?"}follow=${encodeURIComponent(marketId)}`;
    return (
      <SignInButton mode="modal" forceRedirectUrl={back} signUpForceRedirectUrl={back}>
        <button type="button" className={`${base} border-accent text-accent hover:bg-accent hover:text-on-accent`} aria-label={`Follow ${label}`}>
          Follow
        </button>
      </SignInButton>
    );
  }

  const toggle = () =>
    startTransition(async () => {
      setMessage(null);
      setShown(!shown);
      const result = shown ? await unfollow(marketId) : await follow(marketId);
      if (!result.ok) setMessage(result.message);
      router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={shown}
        aria-label={`${shown ? "Unfollow" : "Follow"} ${label}`}
        className={`${base} ${shown ? "border-accent-soft bg-accent-soft text-accent" : "border-accent text-accent hover:bg-accent hover:text-on-accent"} disabled:opacity-60`}
      >
        {shown ? "Following" : "Follow"}
      </button>
      {message ? <p role="alert" className="max-w-48 text-right text-xs text-stale">{message}</p> : null}
    </div>
  );
}
