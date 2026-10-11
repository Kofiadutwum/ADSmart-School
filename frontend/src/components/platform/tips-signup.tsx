"use client";

import { MailCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, fieldErrors, getJson, OFFLINE_MESSAGE, postJson } from "@/lib/client-api";

const CONSENT = "Tick the box to agree to receive tips by email.";

/** Sign-up for new tips by email; the address is confirmed by a link first (§5.6). */
export function TipsSignup({ platformName }: { platformName: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<{ token: string }>("/api/public/enquiries/form-token").then(
      (data) => {
        if (!cancelled) setToken(data.token);
      },
      () => {
        if (!cancelled) setError(OFFLINE_MESSAGE);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sentTo) doneRef.current?.focus();
  }, [sentTo]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = "Enter your email address, like name@example.com.";
    if (!consent) found.consent = CONSENT;
    if (Object.keys(found).length > 0 || !token) {
      setErrors(found);
      setError(token ? "Please check the highlighted fields." : OFFLINE_MESSAGE);
      setAttempt((count) => count + 1);
      return;
    }
    const honeypot = (event.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    setBusy(true);
    try {
      await postJson("/api/public/platform/tips", { email: email.trim(), consent, form_token: token, website: honeypot });
      setSentTo(email.trim());
    } catch (caught) {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="surface rounded-card p-6">
        <MailCheck aria-hidden className="size-10 text-success" />
        <h3 ref={doneRef} tabIndex={-1} className="mt-3 text-xl font-semibold outline-none">
          Check your email
        </h3>
        <p className="mt-2 text-ink-muted">
          We&apos;ve sent a link to {sentTo}. Open it to start receiving tips.
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="tips-title" className="surface space-y-4 rounded-card p-6">
      <h3 id="tips-title" className="text-xl font-semibold">
        Get new tips by email
      </h3>
      <p className="text-ink-muted">Practical ideas for running and growing a school. No more than a few a month.</p>
      <FormAlert message={error} focusKey={attempt} />
      <Field id="tips-email" label="Email" required error={errors.email}>
        {(props) => (
          <input
            {...props}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClasses}
          />
        )}
      </Field>
      <div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-describedby={errors.consent ? "tips-consent-error" : undefined}
            className="mt-0.5 size-5 shrink-0 accent-indigo"
          />
          <span>Send me new tips from {platformName} by email. I can unsubscribe at any time.</span>
        </label>
        {errors.consent && (
          <p id="tips-consent-error" className="text-sm text-danger">
            {errors.consent}
          </p>
        )}
      </div>
      {/* Honeypot: hidden from people, filled in by bots (Phase 1 spec §6.4). */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="tips-website">Leave this field empty</label>
        <input id="tips-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send me tips"}
      </Button>
    </form>
  );
}
