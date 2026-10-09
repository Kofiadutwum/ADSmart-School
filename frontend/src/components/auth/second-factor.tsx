"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { ApiRequestError, errorMessage, postJson } from "@/lib/client-api";

export type SecondFactorStart = { totp_ready: boolean; sms_available: boolean };
type Props = SecondFactorStart & { onDone: () => void; onRestart: () => void };
type Method = "totp" | "sms" | "backup";
type Setup = { secret: string; otpauth_url: string; qr_image: string };

const HEADINGS: Record<Method, string> = {
  totp: "Enter the code from your authenticator app",
  sms: "Enter the code we sent by SMS",
  backup: "Enter a backup code",
};

/** The second sign-in step for senior school staff and the platform team (spec §5.3, amendment §4). */
export function SecondFactor({ totp_ready, sms_available, onDone, onRestart }: Props) {
  const [method, setMethod] = useState<Method>("totp");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settingUp = method === "totp" && !totp_ready;

  // First sign-in: fetch a new key and QR code. State is only set when the request settles.
  useEffect(() => {
    if (!settingUp || setup) return;
    let cancelled = false;
    postJson<Setup>("/api/auth/second-factor/setup").then(
      (data) => {
        if (!cancelled) setSetup(data);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(errorMessage(caught));
        setAttempt((count) => count + 1);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [settingUp, setup]);

  // Each new step's heading takes focus so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [method, backupCodes]);

  function fail(message: string) {
    setError(message);
    setAttempt((count) => count + 1);
  }

  function choose(next: Method) {
    setMethod(next);
    setCode("");
    setError(null);
    setNotice(null);
  }

  async function sendSms() {
    choose("sms");
    try {
      await postJson("/api/auth/second-factor/sms");
      setNotice("We've sent a code to your phone. It expires in 10 minutes.");
    } catch (caught) {
      fail(errorMessage(caught));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.replace(/\s/g, "");
    if (!value) return fail("Enter the code.");
    setBusy(true);
    try {
      if (settingUp) {
        const result = await postJson<{ backup_codes: string[] }>("/api/auth/second-factor/confirm", { code: value });
        setBackupCodes(result.backup_codes);
      } else {
        await postJson("/api/auth/second-factor/verify", { method, code: value });
        onDone();
      }
    } catch (caught) {
      fail(errorMessage(caught));
      if (caught instanceof ApiRequestError && caught.body?.code === "second_factor_expired") setExpired(true);
    } finally {
      setBusy(false);
    }
  }

  if (backupCodes) {
    return (
      <div className="space-y-5">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          Save your backup codes
        </h2>
        <p>
          If you lose your phone, each code lets you sign in once. Print them or write them down and keep them
          somewhere safe. They won&apos;t be shown again.
        </p>
        <ul aria-label="Backup codes" className="grid grid-cols-2 gap-2 font-mono text-lg">
          {backupCodes.map((item) => (
            <li key={item} className="rounded-control bg-ink/5 px-3 py-2 text-center">
              {item}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => window.print()}>
            Print codes
          </Button>
          <Button onClick={onDone}>I&apos;ve saved them, continue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          {settingUp ? "Set up your authenticator app" : HEADINGS[method]}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Your role needs a second step at sign-in, to keep pupils&apos; records safe.
        </p>
      </div>

      {settingUp && (
        <ol className="list-decimal space-y-3 pl-5">
          <li>Install Google Authenticator or Microsoft Authenticator on your phone.</li>
          <li>
            Scan this QR code with the app.
            {setup ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI, nothing to optimise
              <img
                src={setup.qr_image}
                alt="QR code for your authenticator app"
                width={176}
                height={176}
                className="mt-3 rounded-control bg-white p-2"
              />
            ) : (
              <span aria-hidden className="mt-3 block size-44 animate-pulse rounded-control bg-ink/10" />
            )}
            {setup && (
              <span className="mt-2 block text-sm">
                Can&apos;t scan it? Type this key into the app instead:{" "}
                <code data-testid="manual-key" className="font-mono font-semibold break-all">
                  {setup.secret}
                </code>
              </span>
            )}
          </li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
      )}

      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}

      <form noValidate onSubmit={onSubmit} className="space-y-5">
        <FormAlert message={error} focusKey={attempt} />
        <Field id="second-factor-code" label={method === "backup" ? "Backup code" : "6-digit code"} required>
          {(props) => (
            <input
              {...props}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode={method === "backup" ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              className={inputClasses}
            />
          )}
        </Field>
        {expired ? (
          <Button size="lg" className="w-full" onClick={onRestart}>
            Sign in again
          </Button>
        ) : (
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </Button>
        )}
      </form>

      {!expired && (
        <div className="flex flex-col items-start text-sm">
          {method !== "totp" && (
            <button type="button" onClick={() => choose("totp")} className="link min-h-11 cursor-pointer">
              {totp_ready ? "Use my authenticator app" : "Set up an authenticator app"}
            </button>
          )}
          {sms_available && (
            <button type="button" onClick={sendSms} className="link min-h-11 cursor-pointer">
              {method === "sms" ? "Send a new code" : "Text me a code instead"}
            </button>
          )}
          {totp_ready && method !== "backup" && (
            <button type="button" onClick={() => choose("backup")} className="link min-h-11 cursor-pointer">
              Use a backup code
            </button>
          )}
        </div>
      )}
    </div>
  );
}
