"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Field } from "@/components/site/field";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, errorMessage, fieldErrors, getJson, postJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import { formatIdentifier } from "@/lib/identifiers";
import type { AccountKind, SessionInfo } from "@/lib/types";
import { useAuth } from "./auth-provider";

const IDENTIFIER_LABEL: Record<AccountKind, string> = {
  staff: "Username",
  parent: "Mobile number",
  student: "Student ID",
  platform: "Username",
};
const CHECK_FORM = "Please check the highlighted fields.";
const PASSWORD_HINT = "At least 8 characters. A short sentence is easy to remember.";

/** Profile, password, signed-in devices and theme (spec §5.6, §7.1). */
export function AccountView() {
  const { me, refresh } = useAuth();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Your account</h1>
        {me.must_change_password && (
          <p role="alert" className="mt-4 rounded-control border border-amber bg-amber/15 p-4">
            Welcome! Please choose your own password before you continue.
          </p>
        )}
      </div>

      <section aria-labelledby="profile-heading" className="surface rounded-card p-6">
        <h2 id="profile-heading" className="text-xl font-semibold">
          Profile
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Detail term="Name" value={me.display_name} />
          <Detail term={IDENTIFIER_LABEL[me.kind]} value={formatIdentifier(me)} />
          <Detail term={me.roles.length > 1 ? "Roles" : "Role"} value={me.roles.join(", ") || "None yet"} />
        </dl>
      </section>

      <ChangePassword onChanged={refresh} />
      <Sessions />

      <section aria-labelledby="appearance-heading" className="surface rounded-card p-6">
        <h2 id="appearance-heading" className="text-xl font-semibold">
          Appearance
        </h2>
        <ThemeToggle showLabels className="mt-4 bg-ink/5" />
      </section>
    </div>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{term}</dt>
      <dd className="mt-0.5 font-medium break-words">{value}</dd>
    </div>
  );
}

function ChangePassword({ onChanged }: { onChanged: () => Promise<void> }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function fail(message: string, fields: Record<string, string> = {}) {
    setError(message);
    setErrors(fields);
    setAttempt((count) => count + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    const problems: Record<string, string> = {};
    if (!current) problems.current_password = "Enter your current password.";
    if (next.length < 8) problems.new_password = PASSWORD_HINT;
    else if (next !== confirm) problems.confirm = "The two passwords don't match.";
    if (Object.keys(problems).length > 0) return fail(CHECK_FORM, problems);
    setBusy(true);
    try {
      await postJson("/api/auth/password", { current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
      setErrors({});
      setDone(true);
      await onChanged();
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="password-heading" className="surface rounded-card p-6">
      <h2 id="password-heading" className="text-xl font-semibold">
        Change password
      </h2>
      <p className="mt-1 text-sm text-ink-muted">This signs you out on every other device.</p>
      <form noValidate onSubmit={onSubmit} className="mt-5 max-w-md space-y-5">
        {done && (
          <p role="status" className="rounded-control bg-success/10 p-4">
            Password changed. You&apos;ve been signed out everywhere else.
          </p>
        )}
        <FormAlert message={error} focusKey={attempt} />
        <Field id="current-password" label="Current password" required error={errors.current_password}>
          {(props) => (
            <PasswordInput {...props} value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" />
          )}
        </Field>
        <Field id="new-password" label="New password" hint={PASSWORD_HINT} required error={errors.new_password}>
          {(props) => (
            <PasswordInput {...props} value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" />
          )}
        </Field>
        <Field id="confirm-password" label="Type it again" required error={errors.confirm}>
          {(props) => (
            <PasswordInput {...props} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
          )}
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </Button>
      </form>
    </section>
  );
}

function Sessions() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<SessionInfo[]>("/api/auth/sessions").then(
      (rows) => {
        if (!cancelled) setSessions(rows);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOutSession(session: SessionInfo) {
    try {
      await deleteJson(`/api/auth/sessions/${session.id}`);
      setSessions((rows) => rows?.filter((row) => row.id !== session.id) ?? null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-labelledby="sessions-heading" className="surface rounded-card p-6">
      <h2 id="sessions-heading" className="text-xl font-semibold">
        Where you&apos;re signed in
      </h2>
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      )}
      {sessions === null && !error && <p className="mt-4 text-ink-muted">Loading…</p>}
      {sessions && (
        <ul className="mt-4 divide-y divide-line">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {session.device}
                  {session.current && (
                    <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold">This device</span>
                  )}
                </p>
                <p className="text-sm text-ink-muted">
                  Last active {formatDateTime(session.last_seen)}
                  {session.ip_address ? ` · ${session.ip_address}` : ""}
                </p>
              </div>
              {!session.current && (
                <Button variant="outline" onClick={() => signOutSession(session)} aria-label={`Sign out ${session.device}`}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
