"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { firstProblem, InputField, LoadState, textareaClasses, useAction, useLoad, useSubmit } from "@/components/portal/kit";
import { OneTimePasswordNote } from "@/components/portal/one-time-password-note";
import { SaveBar } from "@/components/portal/save-bar";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, getJson, patchJson, postJson, putJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import type { ClassesData, EmploymentStatus, OneTimePassword, StaffDetail, SubjectRow } from "@/lib/types";
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
      <Assignments url={url} staff={data} canEdit={canEdit} onSaved={setData} />
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

type AssignmentsProps = { url: string; staff: StaffDetail; canEdit: boolean; onSaved: (staff: StaffDetail) => void };
type ClassTeacherOf = StaffDetail["class_teacher_of"][number];

/** The classes this person looks after and the subjects they teach this year. The Administrator
 * changes them here; making someone class teacher replaces whoever had that class and term. */
function Assignments({ url, staff, canEdit, onSaved }: AssignmentsProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const { act, busy, alert } = useAction();
  const empty = staff.teaching.length === 0 && staff.class_teacher_of.length === 0;
  if (!canEdit && empty) return null;

  const change = (action: () => Promise<unknown>, done: string) =>
    act(async () => {
      setNotice(null);
      await action();
      onSaved(await getJson<StaffDetail>(url));
      setNotice(done);
    });
  const stopClassTeacher = (row: ClassTeacherOf) =>
    change(
      () => putJson(`/api/school/classes/${row.class_id}/class-teacher`, { term: row.term_id, staff: null }),
      "Removed.",
    );
  const removeSubject = (id: number) => change(() => deleteJson(`/api/school/teaching/${id}`), "Removed.");

  return (
    <section aria-labelledby="assignments-title" className="surface space-y-4 rounded-card p-5 shadow-elev-1">
      <h2 id="assignments-title" className="text-lg font-semibold">
        Classes and subjects this school year
      </h2>
      {empty && <p className="text-ink-muted">No class or subject yet.</p>}
      <ul className="space-y-2">
        {staff.class_teacher_of.map((row) => (
          <li key={`class-${row.id}`} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Class teacher of {row.class} (Term {row.term})
            </span>
            {canEdit && (
              <Button
                variant="outline"
                disabled={busy}
                aria-label={`Stop being class teacher of ${row.class}, Term ${row.term}`}
                onClick={() => void stopClassTeacher(row)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
        {staff.teaching.map((row) => (
          <li key={`teaching-${row.id}`} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {row.subject}, {row.class} (Term {row.term})
            </span>
            {canEdit && (
              <Button
                variant="outline"
                disabled={busy}
                aria-label={`Remove ${row.subject}, ${row.class}, Term ${row.term}`}
                onClick={() => void removeSubject(row.id)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && <AssignChoices staffId={staff.id} busy={busy} change={change} />}
      {alert}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}

type ChoicesProps = {
  staffId: number;
  busy: boolean;
  change: (action: () => Promise<unknown>, done: string) => Promise<void>;
};

/** Two small forms: make this person class teacher of a class, or add a subject they teach. */
function AssignChoices({ staffId, busy, change }: ChoicesProps) {
  const classes = useLoad<ClassesData>("/api/school/classes");
  const subjects = useLoad<SubjectRow[]>("/api/school/subjects");
  const [classTeacher, setClassTeacher] = useState({ school_class: "", term: "" });
  const [teach, setTeach] = useState({ school_class: "", subject: "", term: "" });
  if (!classes.data || !subjects.data) return null;
  if (!classes.data.year || classes.data.terms.length === 0) {
    return (
      <p className="text-ink-muted">
        Add the current school year and its terms under{" "}
        <Link href="/setup/years" className="text-indigo underline-offset-4 hover:underline">
          Years and terms
        </Link>{" "}
        to give this person a class.
      </p>
    );
  }
  const { classes: rows, terms } = classes.data;
  const pick = (
    id: string,
    label: string,
    value: string,
    options: { id: number; name: string }[],
    onChange: (value: string) => void,
  ) => (
    <Field id={id} label={label}>
      {(props) => (
        <select {...props} value={value} onChange={(event) => onChange(event.target.value)} className={inputClasses}>
          <option value="">Choose…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
  const makeClassTeacher = () =>
    change(
      () =>
        putJson(`/api/school/classes/${classTeacher.school_class}/class-teacher`, {
          term: Number(classTeacher.term),
          staff: staffId,
        }),
      "Saved.",
    );
  const addSubject = () =>
    change(
      () =>
        postJson("/api/school/teaching", {
          staff: staffId,
          school_class: Number(teach.school_class),
          subject: Number(teach.subject),
          term: Number(teach.term),
        }),
      "Added.",
    );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <h3 className="font-semibold">Make class teacher</h3>
        {pick("class-teacher-class", "Class teacher of", classTeacher.school_class, rows, (value) =>
          setClassTeacher({ ...classTeacher, school_class: value }),
        )}
        {pick("class-teacher-term", "Term", classTeacher.term, terms, (value) =>
          setClassTeacher({ ...classTeacher, term: value }),
        )}
        <p className="text-sm text-ink-muted">This replaces whoever is class teacher of that class in that term.</p>
        <Button
          disabled={busy || !classTeacher.school_class || !classTeacher.term}
          onClick={() => void makeClassTeacher()}
        >
          Make class teacher
        </Button>
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold">Add a subject they teach</h3>
        {pick("teach-class", "Class", teach.school_class, rows, (value) => setTeach({ ...teach, school_class: value }))}
        {pick("teach-subject", "Subject", teach.subject, subjects.data, (value) => setTeach({ ...teach, subject: value }))}
        {pick("teach-term", "Term", teach.term, terms, (value) => setTeach({ ...teach, term: value }))}
        <Button
          disabled={busy || !teach.school_class || !teach.subject || !teach.term}
          onClick={() => void addSubject()}
        >
          Add subject
        </Button>
      </div>
    </div>
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
