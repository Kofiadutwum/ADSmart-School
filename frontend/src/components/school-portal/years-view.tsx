"use client";

import { useState, type FormEvent } from "react";
import { ConfirmDelete, firstProblem, InputField, LoadState, Tick, useLoad, useSubmit } from "@/components/portal/kit";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, patchJson, postJson } from "@/lib/client-api";
import { formatDate } from "@/lib/dates";
import type { SchoolTerm, SchoolYear } from "@/lib/types";

const YEARS = "/api/school/years";
const byStart = (a: SchoolYear, b: SchoolYear) => b.start_date.localeCompare(a.start_date);

/** School years and their terms (Phase 1 spec §3.1). Adding a term fills its weekdays in the
 * calendar, with Ghana's public holidays marked. */
export function YearsView({ canEdit }: { canEdit: boolean }) {
  const { data, setData, error } = useLoad<SchoolYear[]>(YEARS);
  const [adding, setAdding] = useState(false);
  const rows = data ?? [];

  function saved(year: SchoolYear) {
    const others = rows
      .filter((row) => row.id !== year.id)
      .map((row) => (year.is_current ? { ...row, is_current: false } : row));
    setData([...others, year].sort(byStart));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-ink-muted">Set up each school year and its terms. Mark the year you are in as current.</p>
        {canEdit && !adding && <Button onClick={() => setAdding(true)}>Add a year</Button>}
      </div>
      {adding && (
        <YearForm
          onSaved={(year) => {
            saved(year);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No school years yet." />
      <ul className="grid gap-4">
        {rows.map((year) => (
          <li key={year.id}>
            <YearCard
              year={year}
              canEdit={canEdit}
              onSaved={saved}
              onDeleted={() => setData(rows.filter((row) => row.id !== year.id))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function YearForm({ onSaved, onCancel }: { onSaved: (year: SchoolYear) => void; onCancel: () => void }) {
  const [values, setValues] = useState({
    name: "",
    start_date: "",
    end_date: "",
    is_current: false,
  });
  const { error, errors, attempt, busy, run } = useSubmit();
  const set = (name: keyof typeof values) => (value: string | boolean) => setValues({ ...values, [name]: value });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => onSaved(await postJson<SchoolYear>(YEARS, values)));
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="new-year-title"
      className="surface max-w-xl space-y-4 rounded-card p-5 shadow-elev-1"
    >
      <h2 id="new-year-title" className="text-lg font-semibold">
        Add a year
      </h2>
      <FormAlert message={error} focusKey={attempt} />
      <InputField
        id="year-name"
        label="Name"
        hint="For example 2026/2027."
        required
        value={values.name}
        onChange={set("name")}
        error={errors.name}
      />
      <InputField
        id="year-start"
        label="First day"
        type="date"
        required
        value={values.start_date}
        onChange={set("start_date")}
        error={errors.start_date}
      />
      <InputField
        id="year-end"
        label="Last day"
        type="date"
        required
        value={values.end_date}
        onChange={set("end_date")}
        error={errors.end_date}
      />
      <Tick label="This is the current year" checked={values.is_current} onChange={set("is_current")} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          Save year
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type CardProps = {
  year: SchoolYear;
  canEdit: boolean;
  onSaved: (year: SchoolYear) => void;
  onDeleted: () => void;
};

function YearCard({ year, canEdit, onSaved, onDeleted }: CardProps) {
  const [addingTerm, setAddingTerm] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = `year-${year.id}`;

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

  const withTerms = (next: SchoolTerm[]) => onSaved({ ...year, terms: next.sort((a, b) => a.number - b.number) });
  const deleteTerm = (term: SchoolTerm) =>
    act(async () => {
      await deleteJson(`/api/school/terms/${term.id}`);
      withTerms(year.terms.filter((row) => row.id !== term.id));
    });
  const makeCurrent = () =>
    act(async () =>
      onSaved(
        await patchJson<SchoolYear>(`${YEARS}/${year.id}`, {
          is_current: true,
        }),
      ),
    );
  const deleteYear = () =>
    act(async () => {
      await deleteJson(`${YEARS}/${year.id}`);
      onDeleted();
    });

  return (
    <article aria-labelledby={titleId} className="surface space-y-3 rounded-card p-5 shadow-elev-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {year.name}
        </h2>
        {year.is_current && (
          <span className="rounded-full bg-success/15 px-3 py-1 text-sm font-medium">Current year</span>
        )}
      </div>
      <p className="text-sm text-ink-muted">
        {formatDate(year.start_date)} to {formatDate(year.end_date)}
      </p>
      {year.terms.length === 0 ? (
        <p className="text-sm text-ink-muted">No terms yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {year.terms.map((term) => (
            <li key={term.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>Term {term.number}</strong>: {formatDate(term.start_date)} to {formatDate(term.end_date)}
              </span>
              {canEdit && (
                <ConfirmDelete
                  label={`Delete term ${term.number}`}
                  busy={busy}
                  onConfirm={() => void deleteTerm(term)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {canEdit && addingTerm && (
        <TermForm
          year={year}
          onSaved={(term) => {
            withTerms([...year.terms, term]);
            setAddingTerm(false);
          }}
          onCancel={() => setAddingTerm(false)}
        />
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-3">
          {!addingTerm && year.terms.length < 3 && (
            <Button variant="outline" onClick={() => setAddingTerm(true)}>
              Add a term
            </Button>
          )}
          {!year.is_current && (
            <Button variant="outline" disabled={busy} onClick={() => void makeCurrent()}>
              Make current
            </Button>
          )}
          <ConfirmDelete label="Delete year" busy={busy} onConfirm={() => void deleteYear()} />
        </div>
      )}
    </article>
  );
}

type TermFormProps = {
  year: SchoolYear;
  onSaved: (term: SchoolTerm) => void;
  onCancel: () => void;
};

function TermForm({ year, onSaved, onCancel }: TermFormProps) {
  const free = [1, 2, 3].filter((number) => !year.terms.some((term) => term.number === number));
  const [values, setValues] = useState({
    number: String(free[0] ?? 1),
    start_date: "",
    end_date: "",
  });
  const { error, errors, attempt, busy, run } = useSubmit();
  const set = (name: keyof typeof values) => (value: string) => setValues({ ...values, [name]: value });
  const id = `term-${year.id}`;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { ...values, number: Number(values.number) };
    void run(async () => onSaved(await postJson<SchoolTerm>(`${YEARS}/${year.id}/terms`, body)));
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label={`Add a term to ${year.name}`}
      className="max-w-xl space-y-4 rounded-control bg-ink/5 p-4"
    >
      <FormAlert message={error} focusKey={attempt} />
      <Field id={`${id}-number`} label="Term" required error={errors.number}>
        {(props) => (
          <select
            {...props}
            value={values.number}
            onChange={(event) => set("number")(event.target.value)}
            className={inputClasses}
          >
            {free.map((number) => (
              <option key={number} value={number}>
                Term {number}
              </option>
            ))}
          </select>
        )}
      </Field>
      <InputField
        id={`${id}-start`}
        label="First day"
        type="date"
        required
        value={values.start_date}
        onChange={set("start_date")}
        error={errors.start_date}
      />
      <InputField
        id={`${id}-end`}
        label="Last day"
        type="date"
        required
        value={values.end_date}
        onChange={set("end_date")}
        error={errors.end_date}
      />
      <p className="text-sm text-ink-muted">
        Every weekday becomes a school day, with public holidays marked. Change single days in the calendar.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          Save term
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
