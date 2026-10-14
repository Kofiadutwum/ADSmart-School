"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CHECK_FORM, InputField, LoadState, useLoad, useSubmit } from "@/components/portal/kit";
import { OneTimePasswordNote } from "@/components/portal/one-time-password-note";
import { inputClasses } from "@/components/site/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { postJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import { STAFF_ROLES } from "@/lib/school-roles";
import type { OneTimePassword, StaffDetail, StaffRow } from "@/lib/types";

const STAFF = "/api/school/staff";
const NO_CODES = "Can't get sign-in codes";

export const cannotGetCodes = (row: StaffRow) => row.needs_second_factor && !row.second_factor_ready;

const FILTERS: [string, string, (row: StaffRow) => boolean][] = [
  ["all", "Everyone", () => true],
  ["codes", NO_CODES, cannotGetCodes],
  ["off", "Switched off", (row) => !row.is_active],
  ["demo", "Demo records", (row) => row.is_demo],
];

/** What needs the Administrator's attention about a member of staff, in words. */
export function StaffBadges({ row }: { row: StaffRow }) {
  const badges = [
    !row.is_active && "Switched off",
    row.employment_status === "ON_LEAVE" && "On leave",
    row.employment_status === "LEFT" && "Left the school",
    row.is_demo && "Demo",
    cannotGetCodes(row) && NO_CODES,
  ].filter((badge): badge is string => Boolean(badge));
  return (
    <span className="flex flex-wrap gap-2 lg:justify-end">
      {badges.map((badge) => (
        <span key={badge} className="rounded-full bg-ink/10 px-3 py-0.5 text-sm">
          {badge}
        </span>
      ))}
    </span>
  );
}

/** A school's staff (Phase 1 spec §7.2): who they are, their roles, and who still can't get the
 * sign-in codes their role needs. */
export function StaffView({ canEdit }: { canEdit: boolean }) {
  const { data, setData, error } = useLoad<StaffRow[]>(STAFF);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<OneTimePassword | null>(null);
  const keep = FILTERS.find(([key]) => key === filter)?.[2] ?? (() => true);
  const rows = (data ?? []).filter(keep);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Staff</h1>
          <p className="mt-1 text-ink-muted">Everyone who signs in for the school, and what each can do.</p>
        </div>
        {canEdit && !adding && (
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/import?kind=staff" variant="outline">
              Import from a spreadsheet
            </ButtonLink>
            <Button
              onClick={() => {
                setAdding(true);
                setAdded(null);
              }}
            >
              Add a member of staff
            </Button>
          </div>
        )}
      </div>
      {adding && (
        <AddStaff
          onAdded={(staff, password) => {
            setData([...(data ?? []), staff].sort((a, b) => a.name.localeCompare(b.name)));
            setAdded(password);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {added && <OneTimePasswordNote password={added} />}
      <label className="block max-w-xs text-sm font-medium">
        Show
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className={`${inputClasses} mt-1`}>
          {FILTERS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="Nobody to show." />
      {rows.length > 0 && (
        <ul className="surface divide-y divide-line rounded-card shadow-elev-1">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-1 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center lg:gap-4">
              <div>
                <Link
                  href={`/staff/${row.id}`}
                  className="font-semibold text-indigo underline-offset-4 hover:underline"
                >
                  {row.name}
                </Link>
                <p className="text-sm text-ink-muted">{row.username}</p>
              </div>
              <p className="text-sm">{row.roles.join(", ")}</p>
              <div className="space-y-1 lg:text-right">
                <StaffBadges row={row} />
                <p className="text-sm text-ink-muted">
                  {row.last_sign_in ? `Last signed in ${formatDateTime(row.last_sign_in)}` : "Not signed in yet"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type RoleProps = {
  id: string;
  value: string[];
  onChange: (roles: string[]) => void;
  error?: string;
  disabled?: boolean;
};

export function RoleChoices({ id, value, onChange, error, disabled = false }: RoleProps) {
  const errorId = `${id}-roles-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="font-medium">Roles</legend>
      <div className="mt-1 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {STAFF_ROLES.map((role) => (
          <label key={role} className="inline-flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.includes(role)}
              onChange={(event) =>
                onChange(event.target.checked ? [...value, role].sort() : value.filter((held) => held !== role))
              }
              className="size-5 accent-indigo"
            />
            {role}
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

type NewStaff = { first_name: string; surname: string; username: string; phone: string; email: string };
const EMPTY: NewStaff = { first_name: "", surname: "", username: "", phone: "", email: "" };
type AddProps = { onAdded: (staff: StaffRow, password: OneTimePassword) => void; onCancel: () => void };

function AddStaff({ onAdded, onCancel }: AddProps) {
  const [values, setValues] = useState(EMPTY);
  const [roles, setRoles] = useState<string[]>([]);
  const { error, errors, attempt, busy, run, fail } = useSubmit();
  const set = (name: keyof NewStaff) => (value: string) => setValues({ ...values, [name]: value });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    for (const name of ["first_name", "surname", "username"] as const) {
      if (!values[name].trim()) found[name] = "Fill this in.";
    }
    if (roles.length === 0) found.roles = "Choose at least one role.";
    if (Object.keys(found).length > 0) return fail(CHECK_FORM, found);
    void run(async () => {
      const body = await postJson<{ staff: StaffDetail; one_time_password: string }>(STAFF, { ...values, roles });
      onAdded(body.staff, { username: body.staff.username, one_time_password: body.one_time_password });
    });
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="add-staff-title"
      className="surface max-w-3xl space-y-5 rounded-card p-5 shadow-elev-1"
    >
      <h2 id="add-staff-title" className="text-lg font-semibold">
        Add a member of staff
      </h2>
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-5 lg:grid-cols-2">
        <InputField
          id="staff-first"
          label="First name"
          required
          value={values.first_name}
          onChange={set("first_name")}
          error={errors.first_name}
        />
        <InputField
          id="staff-surname"
          label="Surname"
          required
          value={values.surname}
          onChange={set("surname")}
          error={errors.surname}
        />
        <InputField
          id="staff-username"
          label="Username"
          hint="What they type to sign in, for example k.mensah."
          required
          value={values.username}
          onChange={set("username")}
          error={errors.username}
        />
        <InputField
          id="staff-phone"
          label="Mobile number"
          type="tel"
          hint="For sign-in codes."
          value={values.phone}
          onChange={set("phone")}
          error={errors.phone}
        />
        <InputField
          id="staff-email"
          label="Email"
          type="email"
          value={values.email}
          onChange={set("email")}
          error={errors.email}
        />
      </div>
      <RoleChoices id="staff-new" value={roles} onChange={setRoles} error={errors.roles} />
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
