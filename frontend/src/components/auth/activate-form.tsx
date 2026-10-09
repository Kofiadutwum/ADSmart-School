"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, fieldErrors, getJson, postJson } from "@/lib/client-api";
import { GH_MOBILE } from "@/lib/enquiry-schema";
import { PasswordInput } from "./password-input";

const CHECK_FORM = "Please check the highlighted fields.";
const PHONE_MESSAGE = "Enter a Ghana mobile number, e.g. 024 123 4567.";
const PASSWORD_HINT = "At least 8 characters. A short sentence is easy to remember.";

/** First-time activation and forgotten passwords for parents, by SMS code (spec §5.2). */
export function ActivateForm() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Gives the browser its CSRF cookie before the first POST.
  useEffect(() => {
    getJson("/api/auth/me").catch(() => undefined);
  }, []);

  function fail(message: string, fields: Record<string, string> = {}) {
    setError(message);
    setErrors(fields);
    setAttempt((count) => count + 1);
  }

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!GH_MOBILE.test(phone.replace(/[\s-]/g, ""))) return fail(CHECK_FORM, { phone: PHONE_MESSAGE });
    setBusy(true);
    try {
      const result = await postJson<{ message: string }>("/api/auth/parent/request-code", { phone });
      setNotice(result.message);
      setError(null);
      setErrors({});
      setStep("code");
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (!/^\d{6}$/.test(code.trim())) problems.code = "Enter the 6-digit code from the SMS.";
    if (password.length < 8) problems.password = PASSWORD_HINT;
    else if (password !== confirm) problems.confirm = "The two passwords don't match.";
    if (Object.keys(problems).length > 0) return fail(CHECK_FORM, problems);
    setBusy(true);
    try {
      await postJson("/api/auth/parent/set-password", { phone, code: code.trim(), password, remember });
      router.replace("/account");
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <form noValidate onSubmit={requestCode} className="space-y-5">
        <p>Enter the mobile number the school has for you. We&apos;ll text you a 6-digit code.</p>
        <FormAlert message={error} focusKey={attempt} />
        <Field id="activate-phone" label="Mobile number" required error={errors.phone}>
          {(props) => (
            <input
              {...props}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={inputClasses}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Send code"}
        </Button>
        <p className="text-center text-sm">
          <Link href="/sign-in" className="link">
            Back to sign in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={savePassword} className="space-y-5">
      {notice && (
        <p role="status" className="rounded-control bg-success/10 p-4">
          {notice}
        </p>
      )}
      <FormAlert message={error} focusKey={attempt} />
      <Field id="activate-code" label="Code from the SMS" required error={errors.code}>
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
      <Field id="activate-password" label="New password" hint={PASSWORD_HINT} required error={errors.password}>
        {(props) => (
          <PasswordInput {...props} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        )}
      </Field>
      <Field id="activate-confirm" label="Type it again" required error={errors.confirm}>
        {(props) => (
          <PasswordInput {...props} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
        )}
      </Field>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="size-5 accent-primary"
        />
        Keep me signed in on this phone
      </label>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Set password and sign in"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" className="link min-h-11 cursor-pointer" onClick={() => requestCode()}>
          Send a new code
        </button>
        <button
          type="button"
          className="link min-h-11 cursor-pointer"
          onClick={() => {
            setStep("phone");
            setNotice(null);
            setError(null);
          }}
        >
          Use a different number
        </button>
      </div>
    </form>
  );
}
