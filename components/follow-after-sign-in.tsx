"use client";
// Sign-in then follow (product rule 7): back on /browse?follow=<id> signed in, follow that Market once, then
// drop ?follow from the URL so a reload doesn't repeat it. Following twice is harmless anyway.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { follow } from "@/app/actions/follows";

export function FollowAfterSignIn({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const pendingId = params.get("follow");
  const started = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!signedIn || !pendingId || started.current === pendingId) return;
    started.current = pendingId;
    const rest = new URLSearchParams(params);
    rest.delete("follow");
    startTransition(async () => {
      const result = await follow(pendingId);
      setMessage(result.ok ? "Followed. It's on your Watchlist now." : result.message);
      router.replace(`/browse${rest.size ? `?${rest}` : ""}`, { scroll: false });
      router.refresh();
    });
  }, [signedIn, pendingId, params, router]);

  if (!message) return null;
  return (
    <p role="status" className="mt-3 rounded-md border border-line bg-raised px-3 py-2 text-sm text-dim">
      {message}
    </p>
  );
}
