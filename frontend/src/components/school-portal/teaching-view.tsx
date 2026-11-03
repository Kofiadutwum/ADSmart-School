"use client";

import { useState } from "react";
import { firstProblem, LoadState, useLoad } from "@/components/portal/kit";
import { TeachingPicker } from "@/components/school-portal/teaching-picker";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { deleteJson } from "@/lib/client-api";
import type { ClassesData, SubjectRow, TeachingRow } from "@/lib/types";

const TEACHING = "/api/school/teaching";

/** Who teaches which subject to which class, term by term (Phase 1 spec §7.2; SMS spec §7). It
 * decides which classes each teacher may see. */
export function TeachingView({ canEdit }: { canEdit: boolean }) {
  const classes = useLoad<ClassesData>("/api/school/classes");
  const subjects = useLoad<SubjectRow[]>("/api/school/subjects");
  const [termId, setTermId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const error = classes.error ?? subjects.error;

  if (!classes.data || !subjects.data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  const data = classes.data;
  if (!data.year || data.terms.length === 0) {
    return <p className="text-ink-muted">Add the current school year and its terms first, under Years and terms.</p>;
  }
  const term = termId ?? data.terms[0].id;

  return (
    <div className="space-y-6">
      {canEdit && (
        <section aria-labelledby="assign-title" className="surface space-y-4 rounded-card p-5 shadow-elev-1">
          <h2 id="assign-title" className="text-lg font-semibold">
            Assign teaching
          </h2>
          {data.teachers.length === 0 && (
            <p className="text-sm text-ink-muted">Give staff the Teacher role first, under Staff.</p>
          )}
          <TeachingPicker data={data} subjects={subjects.data} onDone={() => setVersion((count) => count + 1)} />
        </section>
      )}
      <Field id="teaching-term" label="Show term" required className="w-full max-w-xs">
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
      <TermTeaching key={`${term}-${version}`} term={term} canEdit={canEdit} />
    </div>
  );
}

function TermTeaching({ term, canEdit }: { term: number; canEdit: boolean }) {
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
