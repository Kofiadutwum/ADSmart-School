"use client";

import { useState, type FormEvent } from "react";
import {
  ConfirmDelete,
  firstProblem,
  InputField,
  LoadState,
  useLoad,
  useSubmit,
} from "@/components/portal/kit";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, postJson, putJson } from "@/lib/client-api";
import type { ClassesData, SchoolClassRow } from "@/lib/types";

const CLASSES = "/api/school/classes";

/** Classes and streams for a school year, each with its class teacher per term (Phase 1 spec
 * §3.1, §7.2). */
export function ClassesView({ canEdit }: { canEdit: boolean }) {
  const [yearId, setYearId] = useState<number | null>(null);
  const { data, setData, error } = useLoad<ClassesData>(
    yearId ? `${CLASSES}?year=${yearId}` : CLASSES,
  );

  if (!data)
    return (
      <LoadState error={error} loading={!error} empty={false} emptyText="" />
    );
  if (!data.year) {
    return (
      <p className="text-ink-muted">
        Add a school year first, under Years and terms.
      </p>
    );
  }
  const year = data.year;
  const order = data.year_groups.map((group) => group.code);
  const sorted = (rows: SchoolClassRow[]) =>
    [...rows].sort(
      (a, b) =>
        order.indexOf(a.year_group) - order.indexOf(b.year_group) ||
        a.stream.localeCompare(b.stream),
    );
  const replace = (row: SchoolClassRow) =>
    setData({
      ...data,
      classes: sorted([
        ...data.classes.filter((each) => each.id !== row.id),
        row,
      ]),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <Field
          id="classes-year"
          label="School year"
          required
          className="w-full max-w-xs"
        >
          {(props) => (
            <select
              {...props}
              value={year.id}
              onChange={(event) => setYearId(Number(event.target.value))}
              className={inputClasses}
            >
              {data.years.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                  {each.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {canEdit && <AddClass data={data} onAdded={replace} />}
      <LoadState
        error={null}
        loading={false}
        empty={data.classes.length === 0}
        emptyText="No classes in this year yet."
      />
      <ul className="grid gap-4 lg:grid-cols-2">
        {data.classes.map((row) => (
          <li key={row.id}>
            <ClassCard
              row={row}
              data={data}
              canEdit={canEdit}
              onSaved={replace}
              onDeleted={() =>
                setData({
                  ...data,
                  classes: data.classes.filter((each) => each.id !== row.id),
                })
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddClass({
  data,
  onAdded,
}: {
  data: ClassesData;
  onAdded: (row: SchoolClassRow) => void;
}) {
  const [group, setGroup] = useState(data.year_groups[0]?.code ?? "");
  const [stream, setStream] = useState("");
  const { error, errors, attempt, busy, run } = useSubmit();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { academic_year: data.year?.id, year_group: group, stream };
    void run(async () => {
      onAdded(await postJson<SchoolClassRow>(CLASSES, body));
      setStream("");
    });
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label="Add a class"
      className="surface space-y-4 rounded-card p-5 shadow-elev-1"
    >
      <h2 className="text-lg font-semibold">Add a class</h2>
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field
          id="class-group"
          label="Year group"
          required
          error={errors.year_group}
        >
          {(props) => (
            <select
              {...props}
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              className={inputClasses}
            >
              {data.year_groups.map((each) => (
                <option key={each.code} value={each.code}>
                  {each.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <InputField
          id="class-stream"
          label="Stream"
          hint="For example A."
          value={stream}
          onChange={setStream}
          error={errors.stream}
        />
        <Button type="submit" disabled={busy || !group}>
          Add class
        </Button>
      </div>
    </form>
  );
}

type CardProps = {
  row: SchoolClassRow;
  data: ClassesData;
  canEdit: boolean;
  onSaved: (row: SchoolClassRow) => void;
  onDeleted: () => void;
};

function ClassCard({ row, data, canEdit, onSaved, onDeleted }: CardProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = `class-${row.id}`;

  async function act(action: () => Promise<void>, done?: string) {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
    } catch (caught) {
      setProblem(firstProblem(caught));
    } finally {
      setBusy(false);
    }
  }

  const setTeacher = (term: number, staff: string) =>
    act(async () => {
      const body = { term, staff: staff ? Number(staff) : null };
      onSaved(
        await putJson<SchoolClassRow>(
          `${CLASSES}/${row.id}/class-teacher`,
          body,
        ),
      );
    }, "Saved.");

  return (
    <article
      aria-labelledby={titleId}
      className="surface space-y-3 rounded-card p-5 shadow-elev-1"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={titleId} className="text-lg font-semibold">
          {row.name}
        </h3>
        <span className="text-sm text-ink-muted">
          {row.pupils === 1 ? "1 pupil" : `${row.pupils} pupils`}
        </span>
      </div>
      {data.terms.length === 0 && (
        <p className="text-sm text-ink-muted">
          Add terms to choose class teachers.
        </p>
      )}
      <ul className="space-y-2">
        {data.terms.map((term) => {
          const current = row.class_teachers.find(
            (each) => each.term_id === term.id,
          );
          return (
            <li key={term.id}>
              {canEdit ? (
                <label className="block text-sm font-medium">
                  Class teacher, Term {term.number}
                  <select
                    value={current?.staff_id ?? ""}
                    disabled={busy}
                    onChange={(event) =>
                      void setTeacher(term.id, event.target.value)
                    }
                    className={`${inputClasses} mt-1 min-h-11 py-2`}
                  >
                    <option value="">Nobody yet</option>
                    {data.teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-sm">
                  Term {term.number}: {current?.staff_name ?? "nobody yet"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {canEdit && (
        <ConfirmDelete
          label="Delete class"
          busy={busy}
          onConfirm={() =>
            void act(async () => {
              await deleteJson(`${CLASSES}/${row.id}`);
              onDeleted();
            })
          }
        />
      )}
    </article>
  );
}
