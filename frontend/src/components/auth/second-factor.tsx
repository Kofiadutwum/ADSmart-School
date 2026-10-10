"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { ApiRequestError, errorMessage, postJson } from "@/lib/client-api";

/** Where a code can go, masked by the server: "k•••@gmail.com", "024 ••• 4567". */
export type SecondFactorStart = { email: string | null; phone: string | null };
type Props = SecondFactorStart & { onDone: () => void; onRestart: () => void };
type Channel = "email" | "sms";

/**
 * The second sign-in step for senior school staff and the platform team: a 6-digit code sent to
 * the email address or mobile number on their account (owner decision, 2026-10-10).
 */
export function SecondFactor({ email, phone, onDone, onRestart }: Props) {
  const [sentTo, setSentTo] = useState<Channel | null>(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const targets: Record<Channel, string | null> = { email, sms: phone };
  const channels = (["email", "sms"] as const).filter((channel) => targets[channel]);

  // Each new step's heading takes focus so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [sentTo]);

  function fail(caught: unknown) {
    setError(errorMessage(caught));
    setAttempt((count) => count + 1);
    if (caught instanceof ApiRequestError && caught.body?.code === "second_factor_expired") setExpired(true);
  }

  function label(channel: Channel) {
    return channel === "email" ? `Email the code to ${email}` : `Text the code to ${phone}`;
  }

  async function send(channel: Channel) {
    setBusy(true);
    try {
      await postJson(`/api/auth/second-factor/${channel}`);
      setSentTo(channel);
      setCode("");
      setError(null);
      setNotice(`We've sent a 6-digit code to ${targets[channel]}. It expires in 10 minutes.`);
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.replace(/\s/g, "");
    if (!value) {
      setError("Enter the code.");
      setAttempt((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      await postJson("/api/auth/second-factor/verify", { code: value });
      onDone();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  if (expired) {
    return (
      <div className="space-y-5">
        <FormAlert message={error} focusKey={attempt} />
        <Button size="lg" className="w-full" onClick={onRestart}>
          Sign in again
        </Button>
      </div>
    );
  }

  if (!sentTo) {
    return (
      <div className="space-y-5">
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            Confirm it&apos;s you
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Your role needs a second step at sign-in, to keep pupils&apos; records safe. We&apos;ll send you a
            6-digit code.
          </p>
        </div>
        <FormAlert message={error} focusKey={attempt} />
        {channels.length === 0 ? (
          <p role="alert" className="rounded-control border border-danger bg-danger/10 p-4">
            There&apos;s no email address or mobile number on your account, so we can&apos;t send you a code. Ask
            whoever manages your account to add one.
          </p>
        ) : (
          channels.map((channel) => (
            <Button key={channel} size="lg" className="w-full" disabled={busy} onClick={() => send(channel)}>
              {label(channel)}
            </Button>
          ))
        )}
      </div>
    );
  }

  const other = channels.find((channel) => channel !== sentTo);
  return (
    <div className="space-y-5">
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          Enter your code
        </h2>
        {notice && (
          <p role="status" className="mt-1 text-sm">
            {notice}
          </p>
        )}
      </div>
      <form noValidate onSubmit={onSubmit} className="space-y-5">
        <FormAlert message={error} focusKey={attempt} />
        <Field id="second-factor-code" label="6-digit code" required>
          {(props) => (
            <input
              {...props}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              className={inputClasses}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </Button>
      </form>
      <div className="flex flex-col items-start text-sm">
        <button type="button" onClick={() => send(sentTo)} className="link min-h-11 cursor-pointer">
          Send a new code
        </button>
        {other && (
          <button type="button" onClick={() => send(other)} className="link min-h-11 cursor-pointer">
            {label(other)} instead
          </button>
        )}
      </div>
    </div>
  );
}
