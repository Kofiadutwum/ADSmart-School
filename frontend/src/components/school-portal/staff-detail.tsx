"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { firstProblem, InputField, LoadState, textareaClasses, useLoad, useSubmit } from "@/components/portal/kit";
import { OneTimePasswordNote } from "@/components/portal/one-time-password-note";
import { SaveBar } from "@/components/portal/save-bar";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { patchJson, postJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import type { EmploymentStatus, OneTimePassword, StaffDetail } from "@/lib/types";
import { RoleChoices, StaffBadges } from "./staff-view";

const TEXT = [
  "first_name",
  "surname",
  "staff_number",
  "phone",
  "email",
  "licence_number",
  "emergency_contact",
] as const;
type TextName = (typeof TEXT)[number];
type Values = Record<TextName | "qualifications", string> & { employment_status: EmploymentStatus; roles: string[] };
const EMPLOYMENT: [EmploymentStatus, string][] = [
  ["ACTIVE", "Working"],
  ["ON_LEAVE", "On leave"],
  ["LEFT", "Left the school (switches sign-in off)"],
];
const TEXT_FIELDS: [TextName, string, ("tel" | "email")?, string?][] = [
  ["first_name", "First name"],
  ["surname", "Surname"],
  ["staff_number", "Staff number"],
  ["phone", "Mobile number", "tel", "For sign-in codes."],
  ["email", "Email", "email", "Also for sign-in codes."],
  ["licence_number", "Teaching licence number"],
  ["emergency_contact", "Emergency contact", undefined, "A name and phone number."],
];

function valuesOf(staff: StaffDetail): Values {
  const text = Object.fromEntries(TEXT.map((name) => [name, staff[name]])) as Record<TextName, string>;
  return {
    ...text,
    qualifications: staff.qualifications,
    employment_status: staff.employment_status,
    roles: staff.roles,
  };
}

/** One member of staff (Phase 1 spec §7.2, §9): profile, roles, sign-in and their teaching. */
export function StaffDetailView({ id, canEdit }: { id: number; canEdit: boolean }) {
  const url = `/api/school/staff/${id}`;
  const { data, setData, error } = useLoad<StaffDetail>(url);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/staff" className="text-sm text-indigo underline-offset-4 hover:underline">
          All staff
        </Link>
        <h1 className="text-3xl font-semibold">{data.name}</h1>
        <StaffBadges row={data} />
        <p className="text-sm text-ink-muted">
          Username <strong className="text-ink">{data.username}</strong> ·{" "}
          {data.last_sign_in ? `last signed in ${formatDateTime(data.last_sign_in)}` : "not signed in yet"}
        </p>
      </div>
      {canEdit && <Actions url={url} staff={data} onSaved={setData} />}
      <Assignments staff={data} />
      <ProfileFields key={data.id} url={url} staff={data} canEdit={canEdit} onSaved={setData} />
    </div>
  );
}

type ActionsProps = { url: string; staff: StaffDetail; onSaved: (staff: StaffDetail) => void };

function Actions({ url, staff, onSaved }: ActionsProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [password, setPassword] = useState<OneTimePassword | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (caught) {
      setProblem(firstProblem(caught));
    } finally {
      setBusy(false);
    }
  }

  const switchOnOrOff = () =>
    act(async () => onSaved(await patchJson<StaffDetail>(url, { is_active: !staff.is_active })));
  const resetPassword = () => act(async () => setPassword(await postJson<OneTimePassword>(`${url}/reset-password`)));
  const makeReal = () => act(async () => onSaved(await postJson<StaffDetail>(`${url}/make-real`)));

  return (
    <section aria-labelledby="actions-title" className="surface space-y-3 rounded-card p-5 shadow-elev-1">
      <h2 id="actions-title" className="text-lg font-semibold">
        Sign-in
      </h2>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy} onClick={() => void switchOnOrOff()}>
          {staff.is_active ? "Switch off sign-in" : "Switch on sign-in"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void resetPassword()}>
          Reset password
        </Button>
        {staff.is_demo && (
          <Button variant="outline" disabled={busy} onClick={() => void makeReal()}>
            This is now a real record
          </Button>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}
      {password && <OneTimePasswordNote password={password} />}
    </section>
  );
}

function Assignments({ staff }: { staff: StaffDetail }) {
  if (staff.teaching.length === 0 && staff.class_teacher_of.length === 0) return null;
  const link = "text-indigo underline-offset-4 hover:underline";
  return (
    <section aria-labelledby="assignments-title" className="surface space-y-3 rounded-card p-5 shadow-elev-1">
      <h2 id="assignments-title" className="text-lg font-semibold">
        This school year
      </h2>
      <ul className="space-y-1">
        {staff.class_teacher_of.map((row) => (
          <li key={`class-${row.id}`}>
            Class teacher of {row.class} (Term {row.term})
          </li>
        ))}
        {staff.teaching.map((row) => (
          <li key={`teaching-${row.id}`}>
            {row.subject}, {row.class} (Term {row.term})
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <Link href="/setup/teaching" className={link}>
          Change teaching
        </Link>{" "}
        ·{" "}
        <Link href="/setup/classes" className={link}>
          Change class teachers
        </Link>
      </p>
    </section>
  );
}

type FieldsProps = { url: string; staff: StaffDetail; canEdit: boolean; onSaved: (staff: StaffDetail) => void };

function ProfileFields({ url, staff, canEdit, onSaved }: FieldsProps) {
  const [values, setValues] = useState<Values>(() => valuesOf(staff));
  const [notice, setNotice] = useState<string | null>(null);
  const { error, errors, attempt, busy, run } = useSubmit();
  const set = (name: keyof Values) => (value: string | string[]) => setValues({ ...values, [name]: value });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    void run(async () => {
      const saved = await patchJson<StaffDetail>(url, values);
      onSaved(saved);
      setValues(valuesOf(saved));
      setNotice("Saved.");
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="staff-profile-title" className="space-y-6">
      <h2 id="staff-profile-title" className="text-xl font-semibold">
        Profile
      </h2>
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-5 lg:grid-cols-2">
        {TEXT_FIELDS.map(([name, label, type, hint]) => (
          <InputField
            key={name}
            id={`staff-${name}`}
            label={label}
            type={type}
            hint={hint}
            required={name === "first_name" || name === "surname"}
            disabled={!canEdit}
            value={values[name]}
            onChange={set(name)}
            error={errors[name]}
          />
        ))}
        <Field id="staff-employment" label="Employment" required error={errors.employment_status}>
          {(props) => (
            <select
              {...props}
              disabled={!canEdit}
              value={values.employment_status}
              onChange={(event) => set("employment_status")(event.target.value)}
              className={inputClasses}
            >
              {EMPLOYMENT.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field id="staff-qualifications" label="Qualifications" error={errors.qualifications}>
        {(props) => (
          <textarea
            {...props}
            disabled={!canEdit}
            value={values.qualifications}
            onChange={(event) => set("qualifications")(event.target.value)}
            className={textareaClasses}
          />
        )}
      </Field>
      <RoleChoices
        id={`staff-${staff.id}`}
        value={values.roles}
        onChange={set("roles")}
        error={errors.roles}
        disabled={!canEdit}
      />
      {canEdit && (
        <SaveBar>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
        </SaveBar>
      )}
    </form>
  );
}
