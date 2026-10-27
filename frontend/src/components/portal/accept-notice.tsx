"use client";

import { useState } from "react";
import { useAction } from "@/components/portal/kit";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/rich-text";
import { postJson } from "@/lib/client-api";
import type { Me, NoticeToAccept } from "@/lib/types";

/** Before the portal opens, the person reads and accepts the privacy notice in force (Act 843). */
export function AcceptNotice({
  me,
  notice,
  onAccepted,
  onSignOut,
}: {
  me: Me;
  notice: NoticeToAccept;
  onAccepted: (me: Me) => void;
  onSignOut: () => void;
}) {
  const [ticked, setTicked] = useState(false);
  const { act, busy, alert } = useAction();
  const owner = me.school?.name ?? "ADsmartschool";

  return (
    <main id="main" className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-semibold">{notice.title}</h1>
        <p className="mt-2 text-ink-muted">
          Please read how {owner} uses your information. You can use the portal once you have accepted it.
        </p>
      </div>
      <div
        tabIndex={0}
        aria-label={`${notice.title}, version ${notice.version}`}
        className="max-h-[55vh] overflow-y-auto rounded-card border border-line bg-card p-5"
      >
        <RichText text={notice.body} />
      </div>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" className="mt-1 size-5" checked={ticked} onChange={(event) => setTicked(event.target.checked)} />
        <span>I have read and accept the privacy notice (version {notice.version}).</span>
      </label>
      {alert}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!ticked || busy}
          onClick={() => void act(async () => onAccepted(await postJson<Me>("/api/auth/privacy", { notice: notice.id })))}
        >
          {busy ? "Saving…" : "Accept and continue"}
        </Button>
        <Button variant="outline" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
