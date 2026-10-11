"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { errorMessage, postJson } from "@/lib/client-api";

type Action = "confirm" | "unsubscribe";

const DONE: Record<Action, [string, string]> = {
  confirm: ["You're signed up", "We'll email you when new tips are published."],
  unsubscribe: ["You're unsubscribed", "We won't send you any more tips. You can sign up again at any time on our home page."],
};

/** Opens from the links in tip emails (business tools spec §5.6): one request, then the result. */
export function TipsLink({ action }: { action: Action }) {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [message, setMessage] = useState("");
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !token) return;
    sent.current = true;
    postJson(`/api/public/platform/tips/${action}`, { token }).then(
      () => setState("done"),
      (caught: unknown) => {
        setMessage(errorMessage(caught));
        setState("failed");
      },
    );
  }, [action, token]);

  if (!token || state === "failed") {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">That link didn&apos;t work</h1>
        <p role="alert">{message || "This link isn't complete. Please use the link in your email."}</p>
        <Link href="/" className="link">
          Go to the home page
        </Link>
      </div>
    );
  }
  if (state === "working") return <p className="text-ink-muted">One moment…</p>;
  const [title, text] = DONE[action];
  return (
    <div role="status" className="space-y-4">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p>{text}</p>
      <Link href="/" className="link">
        Go to the home page
      </Link>
    </div>
  );
}
