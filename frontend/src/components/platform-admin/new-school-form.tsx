"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, fieldErrors, postJson } from "@/lib/client-api";
import { LEVELS, type LevelCode } from "@/lib/levels";
import { suggestSlug } from "@/lib/slug";
import type { OneTimePassword, SchoolDetail } from "@/lib/types";

type FieldName =
  | "name" | "slug" | "town" | "region" | "phone" | "email"
  | "first_name" | "surname" | "username" | "admin_phone" | "admin_email";
type Values = Record<FieldName, string>;
type Result = { school: SchoolDetail; administrator: OneTimePassword };

const EMPTY: Values = {
  name: "", slug: "", town: "", region: "", phone: "", email: "",
  first_name: "", surname: "", username: "", admin_phone: "", admin_email: "",
};
const CHECK_FORM = "Please check the highlighted fields.";
// The server names the Administrator's fields "administrator.<field>".
const SERVER_NAME: Partial<Record<FieldName, string>> = {
  first_name: "administrator.first_name",
  surname: "administrator.surname",
  username: "administrator.username",
  admin_phone: "administrator.phone",
  admin_email: "administrator.email",
};
const OPTIONAL: FieldName[] = ["admin_email"];
const errorKey = (field: FieldName) => SERVER_NAME[field] ?? field;

type InputOptions = { hint?: string; type?: "text" | "tel" | "email"; optional?: boolean };

/** Add a school with its placeholder site and first Administrator (amendment §5). */
export function NewSchoolForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [slugEdited, setSlugEdited] = useState(false);
  const [levels, setLevels] = useState<LevelCode[]>(LEVELS.map((level) => level.code));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Result | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  function change(field: FieldName, value: string) {
    if (field === "slug") setSlugEdited(true);
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "name" && !slugEdited ? { slug: suggestSlug(value) } : {}),
    }));
  }

  function toggleLevel(code: LevelCode, checked: boolean) {
    setLevels((current) =>
      LEVELS.map((level) => level.code).filter((item) => (item === code ? checked : current.includes(item))),
    );
  }

  function fail(message: string, fields: Record<string, string> = {}) {
    setError(message);
    setErrors(fields);
    setAttempt((count) => count + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing: Record<string, string> = {};
    for (const field of Object.keys(values) as FieldName[]) {
      if (!values[field].trim() && !OPTIONAL.includes(field)) missing[errorKey(field)] = "Fill this in.";
    }
    if (levels.length === 0) missing.levels_offered = "Choose at least one level.";
    if (Object.keys(missing).length > 0) return fail(CHECK_FORM, missing);
    setBusy(true);
    try {
      const { first_name, surname, username, admin_phone, admin_email, ...school } = values;
      setDone(
        await postJson<Result>("/api/platform/schools", {
          ...school,
          levels_offered: levels,
          administrator: { first_name, surname, username, phone: admin_phone, email: admin_email },
        }),
      );
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  function input(field: FieldName, label: string, options: InputOptions = {}) {
    return (
      <Field id={`new-${field}`} label={label} hint={options.hint} required={!options.optional} error={errors[errorKey(field)]}>
        {(props) => (
          <input
            {...props}
            type={options.type ?? "text"}
            value={values[field]}
            onChange={(event) => change(field, event.target.value)}
            autoComplete="off"
            className={inputClasses}
          />
        )}
      </Field>
    );
  }

  if (done) {
    const { school, administrator } = done;
    return (
      <section aria-labelledby="school-ready" className="surface max-w-2xl space-y-4 rounded-card p-6">
        <h1 id="school-ready" ref={doneRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
          {school.name} is set up
        </h1>
        <p>
          Its website is ready in preview at{" "}
          <a href={school.url} target="_blank" rel="noreferrer" className="link">
            {school.url}
          </a>
          .
        </p>
        <p>Give {values.first_name} this one-time password for their first sign-in. It is shown only once.</p>
        <p
          data-testid="one-time-password"
          className="rounded-control bg-ink/5 p-4 text-center font-mono text-2xl tracking-wider"
        >
          {administrator.one_time_password}
        </p>
        <p className="text-sm text-ink-muted">
          Their username is <strong className="text-ink">{administrator.username}</strong>. At their first sign-in
          they confirm it with a code sent to their phone or email, then choose their own password.
        </p>
        <ButtonLink href={`/schools/${school.slug}`}>Open the school&apos;s page</ButtonLink>
      </section>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Add a school</h1>
        <p className="mt-1 text-ink-muted">It starts on trial, with a placeholder website in preview.</p>
      </div>
      <FormAlert message={error} focusKey={attempt} />

      <fieldset className="space-y-5">
        <legend className="text-xl font-semibold">The school</legend>
        {input("name", "School name")}
        {input("slug", "Web address", {
          hint: "Lowercase letters, numbers and hyphens. It cannot be changed later.",
        })}
        <div className="grid gap-5 sm:grid-cols-2">
          {input("town", "Town")}
          {input("region", "Region", { hint: "For example Ashanti Region" })}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {input("phone", "School phone", { type: "tel" })}
          {input("email", "School email", { type: "email" })}
        </div>
        <fieldset aria-describedby={errors.levels_offered ? "new-levels-error" : undefined}>
          <legend className="font-medium">Levels taught</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {LEVELS.map((level) => (
              <label key={level.code} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={levels.includes(level.code)}
                  onChange={(event) => toggleLevel(level.code, event.target.checked)}
                  className="size-5 accent-primary"
                />
                {level.name}
              </label>
            ))}
          </div>
          {errors.levels_offered && (
            <p id="new-levels-error" className="mt-2 text-sm font-medium text-danger">
              {errors.levels_offered}
            </p>
          )}
        </fieldset>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-xl font-semibold">Its first Administrator</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {input("first_name", "First name")}
          {input("surname", "Surname")}
        </div>
        {input("username", "Username", { hint: "They sign in with this, for example esi.owusu" })}
        {input("admin_phone", "Mobile number", {
          type: "tel",
          hint: "Sign-in codes and security messages come here",
        })}
        {input("admin_email", "Email", {
          type: "email",
          optional: true,
          hint: "They can also get their sign-in codes by email",
        })}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Setting up…" : "Add the school"}
        </Button>
        <ButtonLink href="/schools" variant="outline" size="lg">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
