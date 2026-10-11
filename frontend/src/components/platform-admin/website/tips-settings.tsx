"use client";

import { useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { errorMessage, fieldErrors, patchJson } from "@/lib/client-api";
import type { SubscriberCounts } from "@/lib/types";
import { LoadState, WEBSITE_API, useLoad } from "./shared";

type Settings = { whatsapp_channel_url: string };

/** Tip subscribers and the WhatsApp Channel link (business tools spec §5.6). */
export function TipsSettings() {
  const { data: counts, error } = useLoad<SubscriberCounts>(`${WEBSITE_API}/subscribers`);
  const { data: settings, error: settingsError } = useLoad<Settings>(`${WEBSITE_API}/settings`);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Tips and WhatsApp</h1>
        <p className="mt-1 text-ink-muted">
          People who asked for new tips by email, and the link to your WhatsApp Channel.
        </p>
      </div>
      <section aria-labelledby="subscribers-title" className="space-y-4">
        <h2 id="subscribers-title" className="text-xl font-semibold">
          Tip subscribers
        </h2>
        <LoadState error={error} loading={counts === null} empty={false} emptyText="" />
        {counts && (
          <dl className="grid max-w-xl grid-cols-3 gap-4">
            {(
              [
                ["Subscribed", counts.confirmed],
                ["Waiting to confirm", counts.pending],
                ["Unsubscribed", counts.unsubscribed],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="surface rounded-card p-4 shadow-elev-1">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <a href={`${WEBSITE_API}/subscribers.csv`} download className="link inline-flex min-h-11 items-center">
          Download subscribers (CSV, opens in Excel)
        </a>
      </section>
      <LoadState error={settingsError} loading={settings === null} empty={false} emptyText="" />
      {settings && <WhatsAppForm initial={settings.whatsapp_channel_url} />}
    </div>
  );
}

function WhatsAppForm({ initial }: { initial: string }) {
  const [link, setLink] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setError(undefined);
    try {
      const saved = await patchJson<Settings>(`${WEBSITE_API}/settings`, { whatsapp_channel_url: link });
      setLink(saved.whatsapp_channel_url);
      setNotice("Saved.");
    } catch (caught) {
      setError(fieldErrors(caught).whatsapp_channel_url ?? errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="whatsapp-title" className="max-w-xl space-y-4">
      <h2 id="whatsapp-title" className="text-xl font-semibold">
        WhatsApp Channel
      </h2>
      <Field
        id="whatsapp-link"
        label="WhatsApp Channel link"
        hint="Create a channel in WhatsApp, then copy its link here. A Follow on WhatsApp button then appears on your website."
        error={error}
      >
        {(props) => (
          <input
            {...props}
            type="url"
            value={link}
            placeholder="https://whatsapp.com/channel/…"
            onChange={(event) => setLink(event.target.value)}
            className={inputClasses}
          />
        )}
      </Field>
      <Button type="submit" disabled={busy}>
        Save link
      </Button>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </form>
  );
}
