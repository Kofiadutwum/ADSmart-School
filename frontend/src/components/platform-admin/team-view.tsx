"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, fieldErrors, getJson, patchJson, postJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import { formatPhoneLocal } from "@/lib/identifiers";
import { ROLE_LABELS, TEAM_ROLES } from "@/lib/platform-roles";
import type { OneTimePassword, TeamMember } from "@/lib/types";
import { OneTimePasswordNote } from "@/components/portal/one-time-password-note";

const TEAM = "/api/platform/team";
const CHECK_FORM = "Please check the highlighted fields.";
const ROLE_HELP: Record<string, string> = {
  "Platform Owner": "everything, including this Team page",
  "Platform Finance": "plans, bills and payments",
  "Platform Content": "your website's articles, gallery and questions",
  "Platform Support": "schools and requests to join",
};

/** The Owner's Team page (business tools spec §2). */
export function TeamView() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<OneTimePassword | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<TeamMember[]>(TEAM).then(
      (rows) => {
        if (!cancelled) setMembers(rows);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function replace(saved: TeamMember) {
    setMembers((rows) => rows?.map((row) => (row.id === saved.id ? saved : row)) ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Team</h1>
          <p className="mt-1 text-ink-muted">Who can use this admin area, and what each person can do.</p>
        </div>
        {!adding && (
          <Button
            onClick={() => {
              setAdding(true);
              setAdded(null);
            }}
          >
            Add a team member
          </Button>
        )}
      </div>
      <ul className="grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
        {TEAM_ROLES.map((role) => (
          <li key={role}>
            <strong className="text-ink">{ROLE_LABELS[role]}:</strong> {ROLE_HELP[role]}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {members === null && !error && <p className="text-ink-muted">Loading…</p>}
      {adding && (
        <AddMember
          onAdded={(member, password) => {
            setMembers((rows) => [...(rows ?? []), member]);
            setAdded(password);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {added && <OneTimePasswordNote password={added} />}
      {members && (
        <ul className="grid gap-4">
          {members.map((member) => (
            <li key={member.id}>
              <MemberCard member={member} onSaved={replace} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type RoleChoicesProps = { id: string; value: string[]; onChange: (roles: string[]) => void; error?: string };

function RoleChoices({ id, value, onChange, error }: RoleChoicesProps) {
  const errorId = `${id}-roles-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="font-medium">Roles</legend>
      <div className="mt-1 flex flex-wrap gap-x-6">
        {TEAM_ROLES.map((role) => (
          <label key={role} className="inline-flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={value.includes(role)}
              onChange={(event) =>
                onChange(event.target.checked ? [...value, role].sort() : value.filter((held) => held !== role))
              }
              className="size-5 accent-indigo"
            />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

type MemberValues = { first_name: string; surname: string; username: string; phone: string; email: string };
const EMPTY: MemberValues = { first_name: "", surname: "", username: "", phone: "", email: "" };

function AddMember({
  onAdded,
  onCancel,
}: {
  onAdded: (member: TeamMember, password: OneTimePassword) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<MemberValues>(EMPTY);
  const [roles, setRoles] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  function problems(): Record<string, string> {
    const found: Record<string, string> = {};
    for (const name of ["first_name", "surname", "username"] as const) {
      if (!values[name].trim()) found[name] = "Fill this in.";
    }
    if (!values.phone.trim() && !values.email.trim()) found.phone = "Give a mobile number or an email address.";
    if (roles.length === 0) found.roles = "Choose at least one role.";
    return found;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = problems();
    if (Object.keys(found).length > 0) {
      setError(CHECK_FORM);
      setErrors(found);
      setAttempt((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      const body = await postJson<{ member: TeamMember; one_time_password: string }>(TEAM, { ...values, roles });
      onAdded(body.member, { username: body.member.username, one_time_password: body.one_time_password });
    } catch (caught) {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  const fields: [keyof MemberValues, string, "text" | "tel" | "email", boolean, string?][] = [
    ["first_name", "First name", "text", true],
    ["surname", "Surname", "text", true],
    ["username", "Username", "text", true],
    ["phone", "Mobile number", "tel", false, "For sign-in codes. Give a mobile number, an email address or both."],
    ["email", "Email", "email", false],
  ];
  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="add-member-title"
      className="surface max-w-xl space-y-5 rounded-card p-5 shadow-elev-1"
    >
      <h2 id="add-member-title" className="text-lg font-semibold">
        Add a team member
      </h2>
      <FormAlert message={error} focusKey={attempt} />
      {fields.map(([name, label, type, required, hint]) => (
        <Field key={name} id={`member-${name}`} label={label} hint={hint} required={required} error={errors[name]}>
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
      <RoleChoices id="member-new" value={roles} onChange={setRoles} error={errors.roles} />
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

function MemberCard({ member, onSaved }: { member: TeamMember; onSaved: (member: TeamMember) => void }) {
  const [roles, setRoles] = useState(member.roles);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [password, setPassword] = useState<OneTimePassword | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = `member-${member.id}-name`;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  const saveRoles = () =>
    run(async () => {
      const saved = await patchJson<TeamMember>(`${TEAM}/${member.id}`, { roles });
      onSaved(saved);
      setRoles(saved.roles);
      setNotice("Roles saved.");
    });
  const switchOnOrOff = () =>
    run(async () => {
      const saved = await patchJson<TeamMember>(`${TEAM}/${member.id}`, { is_active: !member.is_active });
      onSaved(saved);
      setNotice(saved.is_active ? "Switched on." : "Switched off. They can no longer sign in.");
    });
  const resetPassword = () =>
    run(async () => {
      setPassword(await postJson<OneTimePassword>(`${TEAM}/${member.id}/reset-password`));
    });

  const contact = [member.username, member.phone && formatPhoneLocal(member.phone), member.email].filter(Boolean);
  return (
    <article aria-labelledby={titleId} className="surface space-y-3 rounded-card p-5 shadow-elev-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {member.name}
        </h2>
        {!member.is_active && <span className="rounded-full bg-ink/10 px-3 py-1 text-sm">Switched off</span>}
      </div>
      <p className="text-sm text-ink-muted">{contact.join(" · ")}</p>
      <p className="text-sm text-ink-muted">
        {member.last_sign_in ? `Last signed in ${formatDateTime(member.last_sign_in)}` : "Not signed in yet"}
      </p>
      <FormAlert message={error} focusKey={attempt} />
      <RoleChoices id={`member-${member.id}`} value={roles} onChange={setRoles} />
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy} onClick={saveRoles}>
          Save roles
        </Button>
        <Button variant="outline" disabled={busy} onClick={switchOnOrOff}>
          {member.is_active ? "Switch off" : "Switch on"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={resetPassword}>
          Reset password
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {password && <OneTimePasswordNote password={password} />}
    </article>
  );
}
