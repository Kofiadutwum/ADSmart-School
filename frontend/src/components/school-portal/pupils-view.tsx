"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  CHECK_FORM,
  InputField,
  LoadState,
  NOTICE_TICK_ERROR,
  NoticeTick,
  useLoad,
  useSubmit,
} from "@/components/portal/kit";
import { Field, inputClasses } from "@/components/site/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { postJson } from "@/lib/client-api";
import { todayInAccra } from "@/lib/dates";
import { LEVELS } from "@/lib/levels";
import type { ClassesData, PupilDetail, PupilRow, PupilStatus } from "@/lib/types";
import { PersonPhoto } from "./person-photo";

const PUPILS = "/api/school/pupils";
export const STATUS_LABEL: Record<PupilStatus, string> = {
  ACTIVE: "Active",
  TRANSFERRED: "Transferred",
  COMPLETED: "Completed",
  WITHDRAWN: "Withdrawn",
  SUSPENDED: "Suspended",
};

type Filters = { q: string; class: string; level: string; status: string; demo: string };
const NONE: Filters = { q: "", class: "", level: "", status: "", demo: "" };

function pathFor(filters: Filters): string {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value.trim())).toString();
  return query ? `${PUPILS}?${query}` : PUPILS;
}

export const pupilPhoto = (row: { id: number; has_photo: boolean }) =>
  row.has_photo ? `${PUPILS}/${row.id}/photo` : null;

/** What needs attention about a pupil, in words (Phase 1 spec §3.2, §9). */
export function PupilBadges({ row }: { row: PupilRow }) {
  const badges = [
    row.status !== "ACTIVE" && STATUS_LABEL[row.status],
    row.is_demo && "Demo",
    row.contacts_incomplete && "Fewer than 2 emergency contacts",
  ].filter((badge): badge is string => Boolean(badge));
  return (
    <span className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <span key={badge} className="rounded-full bg-ink/10 px-3 py-0.5 text-sm">
          {badge}
        </span>
      ))}
    </span>
  );
}

/** Every pupil, searched by name or Student ID and filtered by class, level, status or demo
 * (Phase 1 spec §7.2). */
export function PupilsView({ canEdit }: { canEdit: boolean }) {
  const [filters, setFilters] = useState<Filters>(NONE);
  const [applied, setApplied] = useState<Filters>(NONE);
  const [admitting, setAdmitting] = useState(false);
  const classes = useLoad<ClassesData>("/api/school/classes");
  const { data, error } = useLoad<PupilRow[]>(pathFor(applied));
  const set = (name: keyof Filters) => (value: string) => setFilters({ ...filters, [name]: value });
  const classOptions: [string, string][] = (classes.data?.classes ?? []).map((row) => [String(row.id), row.name]);
  const levelOptions: [string, string][] = LEVELS.map((level) => [level.code, level.shortName]);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied(filters);
  }

  const select = (name: keyof Filters, label: string, options: [string, string][]) => (
    <Field id={`pupils-${name}`} label={label}>
      {(props) => (
        <select
          {...props}
          value={filters[name]}
          onChange={(event) => set(name)(event.target.value)}
          className={inputClasses}
        >
          <option value="">All</option>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Pupils</h1>
          <p className="mt-1 text-ink-muted">Search by name or Student ID, or narrow the list.</p>
        </div>
        {canEdit && !admitting && (
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/import" variant="outline">
              Import from a spreadsheet
            </ButtonLink>
            <Button onClick={() => setAdmitting(true)}>Admit a pupil</Button>
          </div>
        )}
      </div>
      {admitting && <AdmitForm classes={classes.data} onCancel={() => setAdmitting(false)} />}
      <form
        noValidate
        onSubmit={onSearch}
        aria-label="Find pupils"
        className="surface grid gap-4 rounded-card p-5 shadow-elev-1 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        <InputField id="pupils-q" label="Name or Student ID" value={filters.q} onChange={set("q")} />
        {select("class", "Class", classOptions)}
        {select("level", "Level", levelOptions)}
        {select("status", "Status", Object.entries(STATUS_LABEL))}
        {select("demo", "Records", [
          ["0", "Real records"],
          ["1", "Demo records"],
        ])}
        <div className="sm:col-span-2 lg:col-span-5">
          <Button type="submit">Search</Button>
        </div>
      </form>
      <LoadState error={error} loading={!data && !error} empty={data?.length === 0} emptyText="No pupils match." />
      {data && data.length > 0 && (
        <>
          <p className="text-sm text-ink-muted" aria-live="polite">
            {data.length === 1 ? "1 pupil" : `${data.length} pupils`}
          </p>
          <ul className="surface divide-y divide-line rounded-card shadow-elev-1">
            {data.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-4 p-4">
                <PersonPhoto src={pupilPhoto(row)} initials={row.initials} name={row.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/pupils/${row.id}`}
                    className="font-semibold text-indigo underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    {row.student_id} · {row.class || "Not in a class"}
                  </p>
                </div>
                <PupilBadges row={row} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

type Admission = {
  first_name: string;
  middle_name: string;
  surname: string;
  date_of_birth: string;
  gender: string;
  admission_date: string;
  previous_school: string;
  address: string;
  school_class: string;
};

function AdmitForm({ classes, onCancel }: { classes: ClassesData | null; onCancel: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Admission>({
    first_name: "",
    middle_name: "",
    surname: "",
    date_of_birth: "",
    gender: "",
    admission_date: todayInAccra(),
    previous_school: "",
    address: "",
    school_class: "",
  });
  const [informed, setInformed] = useState(false);
  const { error, errors, attempt, busy, run, fail } = useSubmit();
  const set = (name: keyof Admission) => (value: string) => setValues({ ...values, [name]: value });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    for (const name of ["first_name", "surname", "date_of_birth"] as const) {
      if (!values[name].trim()) found[name] = "Fill this in.";
    }
    if (!values.gender) found.gender = "Choose one.";
    if (!informed) found.privacy_notice_given = NOTICE_TICK_ERROR;
    if (Object.keys(found).length > 0) return fail(CHECK_FORM, found);
    void run(async () => {
      const body = {
        ...values,
        school_class: values.school_class ? Number(values.school_class) : null,
        privacy_notice_given: informed,
      };
      const pupil = await postJson<PupilDetail>(PUPILS, body);
      router.push(`/pupils/${pupil.id}`);
    });
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="admit-title"
      className="surface max-w-3xl space-y-5 rounded-card p-5 shadow-elev-1"
    >
      <h2 id="admit-title" className="text-lg font-semibold">
        Admit a pupil
      </h2>
      <p className="text-sm text-ink-muted">A Student ID is given on admission.</p>
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-5 lg:grid-cols-2">
        <InputField
          id="admit-first"
          label="First name"
          required
          value={values.first_name}
          onChange={set("first_name")}
          error={errors.first_name}
        />
        <InputField id="admit-middle" label="Middle name" value={values.middle_name} onChange={set("middle_name")} />
        <InputField
          id="admit-surname"
          label="Surname"
          required
          value={values.surname}
          onChange={set("surname")}
          error={errors.surname}
        />
        <InputField
          id="admit-dob"
          label="Date of birth"
          type="date"
          required
          value={values.date_of_birth}
          onChange={set("date_of_birth")}
          error={errors.date_of_birth}
        />
        <Field id="admit-gender" label="Gender" required error={errors.gender}>
          {(props) => (
            <select
              {...props}
              value={values.gender}
              onChange={(event) => set("gender")(event.target.value)}
              className={inputClasses}
            >
              <option value="">Choose…</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
            </select>
          )}
        </Field>
        <InputField
          id="admit-date"
          label="Admission date"
          type="date"
          required
          value={values.admission_date}
          onChange={set("admission_date")}
          error={errors.admission_date}
        />
        <InputField
          id="admit-previous"
          label="Previous school"
          value={values.previous_school}
          onChange={set("previous_school")}
        />
        <InputField id="admit-address" label="Address" value={values.address} onChange={set("address")} />
        <Field
          id="admit-class"
          label="First class"
          hint="You can also place pupils later, under Enrolment."
          error={errors.school_class}
        >
          {(props) => (
            <select
              {...props}
              value={values.school_class}
              onChange={(event) => set("school_class")(event.target.value)}
              className={inputClasses}
            >
              <option value="">Not yet</option>
              {(classes?.classes ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <NoticeTick
        label="The family has been given the school's privacy notice."
        checked={informed}
        onChange={setInformed}
        error={errors.privacy_notice_given}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Admitting…" : "Admit"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
