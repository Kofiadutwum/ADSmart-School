"use client";

import { useState, type FormEvent } from "react";
import {
  ConfirmDelete,
  firstProblem,
  InputField,
  LoadState,
  Tick,
  useLoad,
  useSubmit,
} from "@/components/portal/kit";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, patchJson, postJson } from "@/lib/client-api";
import { LEVELS } from "@/lib/levels";
import type { SubjectRow } from "@/lib/types";

const SUBJECTS = "/api/school/subjects";
type Values = Omit<SubjectRow, "id">;
const EMPTY: Values = {
  name: "",
  code: "",
  bands: [],
  is_learning_area: false,
};

const bandNames = (bands: string[]) =>
  LEVELS.filter((level) => bands.includes(level.code))
    .map((level) => level.shortName)
    .join(", ");

/** Subjects and early-years learning areas, with the levels that study each (Phase 1 spec
 * §3.1, §7.2). */
export function SubjectsView({ canEdit }: { canEdit: boolean }) {
  const { data, setData, error } = useLoad<SubjectRow[]>(SUBJECTS);
  const rows = data ?? [];
  const byName = (list: SubjectRow[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name));
  const replace = (row: SubjectRow) =>
    setData(byName([...rows.filter((each) => each.id !== row.id), row]));

  return (
    <div className="space-y-6">
      {canEdit && (
        <SubjectForm
          label="Add a subject"
          submitLabel="Add subject"
          initial={EMPTY}
          send={(values) => postJson<SubjectRow>(SUBJECTS, values)}
          onSaved={replace}
          resetAfter
        />
      )}
      <LoadState
        error={error}
        loading={!data && !error}
        empty={rows.length === 0}
        emptyText="No subjects yet."
      />
      <ul className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id}>
            <SubjectCard
              row={row}
              canEdit={canEdit}
              onSaved={replace}
              onDeleted={() =>
                setData(rows.filter((each) => each.id !== row.id))
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

type FormProps = {
  label: string;
  submitLabel: string;
  initial: Values;
  send: (values: Values) => Promise<SubjectRow>;
  onSaved: (row: SubjectRow) => void;
  onCancel?: () => void;
  resetAfter?: boolean;
};

function SubjectForm({
  label,
  submitLabel,
  initial,
  send,
  onSaved,
  onCancel,
  resetAfter = false,
}: FormProps) {
  const [values, setValues] = useState(initial);
  const { error, errors, attempt, busy, run, fail } = useSubmit();
  const id = label.toLowerCase().replaceAll(" ", "-");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values.bands.length === 0) {
      return fail("Please check the highlighted fields.", {
        bands: "Choose the levels that study it.",
      });
    }
    void run(async () => {
      onSaved(await send(values));
      if (resetAfter) setValues(EMPTY);
    });
  }

  const toggle = (code: string, on: boolean) =>
    setValues({
      ...values,
      bands: LEVELS.map((level) => level.code).filter((each) =>
        each === code ? on : values.bands.includes(each),
      ),
    });

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label={label}
      className="surface space-y-4 rounded-card p-5 shadow-elev-1"
    >
      {resetAfter && <h2 className="text-lg font-semibold">{label}</h2>}
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <InputField
          id={`${id}-name`}
          label="Name"
          required
          value={values.name}
          onChange={(name) => setValues({ ...values, name })}
          error={errors.name}
        />
        <InputField
          id={`${id}-code`}
          label="Code"
          hint="For example MATH."
          required
          value={values.code}
          onChange={(code) => setValues({ ...values, code })}
          error={errors.code}
        />
      </div>
      <fieldset
        aria-describedby={errors.bands ? `${id}-bands-error` : undefined}
      >
        <legend className="font-medium">Levels that study it</legend>
        <div className="mt-1 flex flex-wrap gap-x-6">
          {LEVELS.map((level) => (
            <label
              key={level.code}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2"
            >
              <input
                type="checkbox"
                checked={values.bands.includes(level.code)}
                onChange={(event) => toggle(level.code, event.target.checked)}
                className="size-5 accent-indigo"
              />
              {level.shortName}
            </label>
          ))}
        </div>
        {errors.bands && (
          <p id={`${id}-bands-error`} className="mt-1 text-sm text-danger">
            {errors.bands}
          </p>
        )}
      </fieldset>
      <Tick
        label="A learning area (early years, assessed by description)"
        checked={values.is_learning_area}
        onChange={(is_learning_area) =>
          setValues({ ...values, is_learning_area })
        }
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

type CardProps = {
  row: SubjectRow;
  canEdit: boolean;
  onSaved: (row: SubjectRow) => void;
  onDeleted: () => void;
};

function SubjectCard({ row, canEdit, onSaved, onDeleted }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const titleId = `subject-${row.id}`;

  async function remove() {
    setProblem(null);
    try {
      await deleteJson(`${SUBJECTS}/${row.id}`);
      onDeleted();
    } catch (caught) {
      setProblem(firstProblem(caught));
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      className="surface space-y-3 rounded-card p-5 shadow-elev-1"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={titleId} className="text-lg font-semibold">
          {row.name}
        </h3>
        {row.is_learning_area && (
          <span className="rounded-full bg-ink/10 px-3 py-1 text-sm">
            Learning area
          </span>
        )}
      </div>
      <p className="text-sm text-ink-muted">
        {row.code} · {bandNames(row.bands)}
      </p>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {editing && (
        <SubjectForm
          label={`Edit ${row.name}`}
          submitLabel="Save"
          initial={{
            name: row.name,
            code: row.code,
            bands: row.bands,
            is_learning_area: row.is_learning_area,
          }}
          send={(values) =>
            patchJson<SubjectRow>(`${SUBJECTS}/${row.id}`, values)
          }
          onSaved={(saved) => {
            onSaved(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
      {canEdit && !editing && (
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <ConfirmDelete onConfirm={() => void remove()} />
        </div>
      )}
    </article>
  );
}
