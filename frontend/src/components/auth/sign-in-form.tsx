"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, getJson, postJson } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { safeNext } from "@/lib/safe-next";
import type { AccountKind, SignInResult } from "@/lib/types";
import { PasswordInput } from "./password-input";
import { SecondFactor, type SecondFactorStart } from "./second-factor";

type Tab = { label: string; identifier: string; hint?: string; inputMode: "tel" | "numeric" | "text" };

const TABS: Record<AccountKind, Tab> = {
  parent: { label: "Parent", identifier: "Mobile number", hint: "The number the school has for you, e.g. 024 123 4567.", inputMode: "tel" },
  student: { label: "Student", identifier: "Student ID", hint: "Your 7-digit Student ID, e.g. 26-0147-1.", inputMode: "numeric" },
  staff: { label: "Staff", identifier: "Username", inputMode: "text" },
  platform: { label: "Platform staff", identifier: "Username", inputMode: "text" },
};

const FORGOTTEN: Record<Exclude<AccountKind, "parent">, string> = {
  student: "Forgot your password? Ask your class teacher.",
  staff: "Forgot your password? Ask the school administrator.",
  platform: "Forgot your password? Ask another member of the platform team.",
};

/**
 * Sign-in for the accounts this address accepts (spec §5.1, amendment §2.1): a school's
 * Parent, Student and Staff tabs, or platform staff alone at the admin address.
 */
/** `home`: where to land when the sign-in page wasn't given a page to return to. */
export function SignInForm({ kinds, home = "/account" }: { kinds: readonly AccountKind[]; home?: string }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), home);
  const [kind, setKind] = useState<AccountKind>(kinds[0]);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<SecondFactorStart | null>(null);
  const tab = TABS[kind];
  const tabbed = kinds.length > 1;

  // Already signed in here? Go straight on. The request also gives the browser its CSRF cookie.
  useEffect(() => {
    let cancelled = false;
    getJson("/api/auth/me").then(
      () => {
        if (!cancelled) router.replace(next);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  function fail(message: string) {
    setError(message);
    setAttempt((count) => count + 1);
  }

  function selectTab(nextKind: AccountKind) {
    setKind(nextKind);
    setIdentifier("");
    setError(null);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const target = kinds[(index + step + kinds.length) % kinds.length];
    selectTab(target);
    document.getElementById(`sign-in-tab-${target}`)?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identifier.trim() || !password) return fail(`Enter your ${tab.identifier.toLowerCase()} and password.`);
    setBusy(true);
    try {
      const result = await postJson<SignInResult>("/api/auth/login", {
        kind,
        identifier,
        password,
        remember: kind === "parent" && remember,
      });
      if (result.status === "second_factor") setPending(result);
      else router.replace(next);
    } catch (caught) {
      fail(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <SecondFactor
        {...pending}
        onDone={() => router.replace(next)}
        onRestart={() => {
          setPending(null);
          setPassword("");
        }}
      />
    );
  }

  return (
    <div>
      {tabbed && (
        <div role="tablist" aria-label="I am a" className="flex gap-1 rounded-control bg-ink/5 p-1">
          {kinds.map((item, index) => {
            const selected = item === kind;
            return (
              <button
                key={item}
                id={`sign-in-tab-${item}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="sign-in-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(item)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={cn(
                  "press min-h-11 flex-1 cursor-pointer rounded-[10px] text-sm font-semibold",
                  selected ? "bg-card text-ink shadow-elev-1" : "text-ink-muted hover:text-ink",
                )}
              >
                {TABS[item].label}
              </button>
            );
          })}
        </div>
      )}

      <form
        id="sign-in-panel"
        role={tabbed ? "tabpanel" : undefined}
        aria-labelledby={tabbed ? `sign-in-tab-${kind}` : undefined}
        noValidate
        onSubmit={onSubmit}
        className={cn("space-y-5", tabbed && "mt-6")}
      >
        <FormAlert message={error} focusKey={attempt} />
        <Field id="sign-in-identifier" label={tab.identifier} hint={tab.hint} required>
          {(props) => (
            <input
              {...props}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              type={kind === "parent" ? "tel" : "text"}
              inputMode={tab.inputMode}
              autoComplete={kind === "parent" ? "tel" : "username"}
              autoCapitalize="none"
              spellCheck={false}
              className={inputClasses}
            />
          )}
        </Field>
        <Field id="sign-in-password" label="Password" required>
          {(props) => (
            <PasswordInput
              {...props}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          )}
        </Field>
        {kind === "parent" && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="size-5 accent-primary"
            />
            Keep me signed in on this phone
          </label>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-sm">
          {kind === "parent" ? (
            <Link href="/activate" className="link">
              First time, or forgot your password?
            </Link>
          ) : (
            FORGOTTEN[kind]
          )}
        </p>
      </form>
    </div>
  );
}
