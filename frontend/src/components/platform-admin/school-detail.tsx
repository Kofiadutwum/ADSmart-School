"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, fieldErrors, getJson, postJson } from "@/lib/client-api";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatPhoneLocal } from "@/lib/identifiers";
import type { Administrator, OneTimePassword, SchoolDetail, SchoolStatus } from "@/lib/types";
import { STATUS_LABEL, StatusBadge } from "./status-badge";

const COUNTS = [
  ["pupils", "Pupils"],
  ["staff", "Staff"],
  ["parents", "Parents"],
  ["enquiries", "Enquiries"],
] as const;
const CHECK_FORM = "Please check the highlighted fields.";

/** One school as the platform team sees it: counts and setup, never records (amendment §4, §5). */
export function SchoolDetailView({ slug }: { slug: string }) {
  const path = `/api/platform/schools/${slug}`;
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<SchoolDetail>(path).then(
      (data) => {
        if (!cancelled) setSchool(data);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  async function refresh() {
    setSchool(await getJson<SchoolDetail>(path));
  }

  if (error)
    return (
      <p role="alert" className="text-danger">
        {error}
      </p>
    );
  if (!school) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/schools" className="link text-sm">
          All schools
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{school.name}</h1>
          <StatusBadge status={school.status} />
        </div>
        <p className="mt-1 text-ink-muted">
          {school.town}, {school.region} · added {formatDate(school.created_at)}
        </p>
        <a href={school.url} target="_blank" rel="noreferrer" className="link mt-2 inline-block">
          Open the website
        </a>
      </div>

      <section aria-labelledby="counts-heading" className="surface rounded-card p-6">
        <h2 id="counts-heading" className="text-xl font-semibold">
          At a glance
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {COUNTS.map(([key, label]) => (
            <div key={key}>
              <dt className="text-sm text-ink-muted">{label}</dt>
              <dd className="text-2xl font-semibold">{school.counts[key]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-ink-muted">Counts only: pupils&apos; and families&apos; records stay with the school.</p>
      </section>

      <section aria-labelledby="website-heading" className="surface rounded-card p-6">
        <h2 id="website-heading" className="text-xl font-semibold">
          Website
        </h2>
        {school.blockers.length === 0 ? (
          <p className="mt-2">The website is live.</p>
        ) : (
          <>
            <p className="mt-2">It stays in preview until the school has done these:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {school.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Administrators school={school} onChanged={refresh} />
      {/* Keyed by status, so its choices and fields reset after each change. */}
      <StatusForm
        key={school.status}
        school={school}
        notice={statusNotice}
        onChanged={(updated) => {
          setStatusNotice(`${updated.name} is now ${STATUS_LABEL[updated.status].toLowerCase()}.`);
          setSchool(updated);
        }}
      />
    </div>
  );
}

function OneTimePasswordNote({ password }: { password: OneTimePassword }) {
  return (
    <div role="status" className="mt-3 rounded-control bg-success/10 p-4">
      <p>
        One-time password for <strong>{password.username}</strong>, shown only once:
      </p>
      <p data-testid="one-time-password" className="mt-1 font-mono text-xl tracking-wider">
        {password.one_time_password}
      </p>
      <p className="mt-1 text-sm">They must change it at their next sign-in.</p>
    </div>
  );
}

function Administrators({ school, onChanged }: { school: SchoolDetail; onChanged: () => Promise<void> }) {
  const base = `/api/platform/schools/${school.slug}/administrators`;
  const [revealed, setRevealed] = useState<{ id: number | "new"; password: OneTimePassword } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function resetPassword(admin: Administrator) {
    if (!window.confirm(`Reset ${admin.name}'s password? They are signed out everywhere and told by SMS.`)) return;
    try {
      const password = await postJson<OneTimePassword>(`${base}/${admin.id}/reset-password`);
      setRevealed({ id: admin.id, password });
      setNotice(null);
      setError(null);
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function resetAuthenticator(admin: Administrator) {
    if (!window.confirm(`Reset ${admin.name}'s authenticator app? They set up a new one at their next sign-in.`))
      return;
    try {
      await postJson(`${base}/${admin.id}/reset-second-factor`);
      setNotice(`${admin.name}'s authenticator app was reset. They set up a new one at their next sign-in.`);
      setRevealed(null);
      setError(null);
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-labelledby="admins-heading" className="surface rounded-card p-6">
      <h2 id="admins-heading" className="text-xl font-semibold">
        Administrators
      </h2>
      {error && (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3">
          {notice}
        </p>
      )}
      {school.administrators.length === 0 && <p className="mt-3 text-ink-muted">No Administrators yet.</p>}
      <ul className="mt-3 divide-y divide-line">
        {school.administrators.map((admin) => (
          <li key={admin.id} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{admin.name}</p>
                <p className="text-sm text-ink-muted">
                  {admin.username}
                  {admin.phone && (
                    <>
                      {" · "}
                      <a href={`tel:${admin.phone}`} className="link">
                        {formatPhoneLocal(admin.phone)}
                      </a>
                    </>
                  )}
                </p>
                <p className="text-sm text-ink-muted">
                  {admin.has_authenticator ? "Authenticator app set up" : "No authenticator app yet"} ·{" "}
                  {admin.last_sign_in ? `last signed in ${formatDateTime(admin.last_sign_in)}` : "not signed in yet"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => resetPassword(admin)} aria-label={`Reset password for ${admin.name}`}>
                  Reset password
                </Button>
                {admin.has_authenticator && (
                  <Button
                    variant="outline"
                    onClick={() => resetAuthenticator(admin)}
                    aria-label={`Reset authenticator app for ${admin.name}`}
                  >
                    Reset authenticator
                  </Button>
                )}
              </div>
            </div>
            {revealed?.id === admin.id && <OneTimePasswordNote password={revealed.password} />}
          </li>
        ))}
      </ul>
      {revealed?.id === "new" && <OneTimePasswordNote password={revealed.password} />}
      {adding ? (
        <AddAdministrator
          base={base}
          onAdded={async (password) => {
            setRevealed({ id: "new", password });
            setAdding(false);
            await onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="outline" className="mt-4" onClick={() => setAdding(true)}>
          Add an Administrator
        </Button>
      )}
    </section>
  );
}

type AdminValues = Record<"first_name" | "surname" | "username" | "phone", string>;

function AddAdministrator({
  base,
  onAdded,
  onCancel,
}: {
  base: string;
  onAdded: (password: OneTimePassword) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<AdminValues>({ first_name: "", surname: "", username: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => !value.trim())
        .map(([name]) => [name, "Fill this in."]),
    );
    if (Object.keys(missing).length > 0) {
      setError(CHECK_FORM);
      setErrors(missing);
      setAttempt((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      await onAdded(await postJson<OneTimePassword>(base, values));
    } catch (caught) {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  const fields: [keyof AdminValues, string, "text" | "tel"][] = [
    ["first_name", "First name", "text"],
    ["surname", "Surname", "text"],
    ["username", "Username", "text"],
    ["phone", "Mobile number", "tel"],
  ];
  return (
    <form noValidate onSubmit={onSubmit} className="mt-4 max-w-md space-y-5">
      <h3 className="text-lg font-semibold">Add an Administrator</h3>
      <FormAlert message={error} focusKey={attempt} />
      {fields.map(([name, label, type]) => (
        <Field key={name} id={`add-admin-${name}`} label={label} required error={errors[name]}>
          {(props) => (
            <input
              {...props}
              type={type}
              value={values[name]}
              onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
              autoComplete="off"
              className={inputClasses}
            />
          )}
        </Field>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type StatusFormProps = {
  school: SchoolDetail;
  notice: string | null;
  onChanged: (school: SchoolDetail) => void;
};

function StatusForm({ school, notice, onChanged }: StatusFormProps) {
  const choices = (Object.keys(STATUS_LABEL) as SchoolStatus[]).filter((status) => status !== school.status);
  const [status, setStatus] = useState<SchoolStatus>(choices.includes("suspended") ? "suspended" : choices[0]);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) {
      setError(CHECK_FORM);
      setErrors({ reason: "Give a reason. It goes in the audit log." });
      setAttempt((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      onChanged(await postJson<SchoolDetail>(`/api/platform/schools/${school.slug}/status`, { status, reason }));
    } catch (caught) {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="status-heading" className="surface rounded-card p-6">
      <h2 id="status-heading" className="text-xl font-semibold">
        Status
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Suspending signs the school&apos;s users out and takes its website offline.
      </p>
      {notice && (
        <p role="status" className="mt-4 rounded-control bg-success/10 p-4">
          {notice}
        </p>
      )}
      <form noValidate onSubmit={onSubmit} className="mt-5 max-w-md space-y-5">
        <FormAlert message={error} focusKey={attempt} />
        <Field id="status-new" label="New status" required>
          {(props) => (
            <select
              {...props}
              value={status}
              onChange={(event) => setStatus(event.target.value as SchoolStatus)}
              className={inputClasses}
            >
              {choices.map((choice) => (
                <option key={choice} value={choice}>
                  {STATUS_LABEL[choice]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="status-reason" label="Reason" required error={errors.reason}>
          {(props) => (
            <textarea
              {...props}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={inputClasses}
            />
          )}
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change status"}
        </Button>
      </form>
    </section>
  );
}
