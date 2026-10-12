"use client";

import { useState, type FormEvent } from "react";
import { firstProblem, LoadState, useLoad, useSubmit } from "@/components/portal/kit";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, postJson } from "@/lib/client-api";
import type { ClassesData, SubjectRow, TeachingRow } from "@/lib/types";

const TEACHING = "/api/school/teaching";

/** Who teaches which subject to which class, term by term (Phase 1 spec §7.2; SMS spec §7). It
 * decides which classes each teacher may see. */
export function TeachingView({ canEdit }: { canEdit: boolean }) {
  const classes = useLoad<ClassesData>("/api/school/classes");
  const subjects = useLoad<SubjectRow[]>("/api/school/subjects");
  const [termId, setTermId] = useState<number | null>(null);
  const error = classes.error ?? subjects.error;

  if (!classes.data || !subjects.data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  const data = classes.data;
  if (!data.year || data.terms.length === 0) {
    return <p className="text-ink-muted">Add the current school year and its terms first, under Years and terms.</p>;
  }
  const term = termId ?? data.terms[0].id;

  return (
    <div className="space-y-6">
      <Field id="teaching-term" label="Term" required className="w-full max-w-xs">
        {(props) => (
          <select
            {...props}
            value={term}
            onChange={(event) => setTermId(Number(event.target.value))}
            className={inputClasses}
          >
            {data.terms.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <TermTeaching key={term} term={term} data={data} subjects={subjects.data} canEdit={canEdit} />
    </div>
  );
}

type TermProps = {
  term: number;
  data: ClassesData;
  subjects: SubjectRow[];
  canEdit: boolean;
};

function TermTeaching({ term, data, subjects, canEdit }: TermProps) {
  const { data: rows, setData, error } = useLoad<TeachingRow[]>(`${TEACHING}?term=${term}`);
  const [problem, setProblem] = useState<string | null>(null);

  async function remove(row: TeachingRow) {
    setProblem(null);
    try {
      await deleteJson(`${TEACHING}/${row.id}`);
      setData((rows ?? []).filter((each) => each.id !== row.id));
    } catch (caught) {
      setProblem(firstProblem(caught));
    }
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <AssignForm term={term} data={data} subjects={subjects} onAdded={(row) => setData([...(rows ?? []), row])} />
      )}
      <LoadState
        error={error}
        loading={!rows && !error}
        empty={rows?.length === 0}
        emptyText="Nobody is assigned to teach in this term yet."
      />
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="surface overflow-x-auto rounded-card shadow-elev-1">
          <table className="w-full text-left">
            <thead className="border-b border-line text-sm text-ink-muted">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  Teacher
                </th>
                <th scope="col" className="p-3 font-medium">
                  Class
                </th>
                <th scope="col" className="p-3 font-medium">
                  Subject
                </th>
                {canEdit && (
                  <th scope="col" className="p-3">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="p-3">{row.teacher}</td>
                  <td className="p-3">{row.class}</td>
                  <td className="p-3">{row.subject}</td>
                  {canEdit && (
                    <td className="p-3 text-right">
                      <Button
                        variant="outline"
                        aria-label={`Remove ${row.teacher}, ${row.subject}, ${row.class}`}
                        onClick={() => void remove(row)}
                      >
                        Remove
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type AssignProps = {
  term: number;
  data: ClassesData;
  subjects: SubjectRow[];
  onAdded: (row: TeachingRow) => void;
};
type Choices = { staff: string; school_class: string; subject: string };

function AssignForm({ term, data, subjects, onAdded }: AssignProps) {
  const [values, setValues] = useState<Choices>({
    staff: "",
    school_class: "",
    subject: "",
  });
  const { error, errors, attempt, busy, run, fail } = useSubmit();
  const chosenClass = data.classes.find((each) => String(each.id) === values.school_class);
  const studied = chosenClass ? subjects.filter((subject) => subject.bands.includes(chosenClass.band)) : [];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = Object.entries(values).filter(([, value]) => !value);
    if (missing.length > 0) {
      return fail(
        "Please check the highlighted fields.",
        Object.fromEntries(missing.map(([name]) => [name, "Choose one."])),
      );
    }
    const body = {
      staff: Number(values.staff),
      school_class: Number(values.school_class),
      subject: Number(values.subject),
      term,
    };
    void run(async () => {
      onAdded(await postJson<TeachingRow>(TEACHING, body));
      setValues({ ...values, subject: "" });
    });
  }

  function choose(name: keyof Choices, value: string) {
    // A new class may not study the subject chosen before.
    setValues({
      ...values,
      [name]: value,
      ...(name === "school_class" ? { subject: "" } : {}),
    });
  }

  const select = (name: keyof Choices, label: string, options: { id: number; name: string }[]) => (
    <Field id={`assign-${name}`} label={label} required error={errors[name]}>
      {(props) => (
        <select
          {...props}
          value={values[name]}
          onChange={(event) => choose(name, event.target.value)}
          className={inputClasses}
        >
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

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label="Assign teaching"
      className="surface space-y-4 rounded-card p-5 shadow-elev-1"
    >
      <h2 className="text-lg font-semibold">Assign teaching</h2>
      <FormAlert message={error} focusKey={attempt} />
      {data.teachers.length === 0 && (
        <p className="text-sm text-ink-muted">Give staff the Teacher role first, under Staff.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {select("staff", "Teacher", data.teachers)}
        {select("school_class", "Class", data.classes)}
        {select("subject", "Subject", studied)}
      </div>
      <Button type="submit" disabled={busy}>
        Assign
      </Button>
    </form>
  );
}
