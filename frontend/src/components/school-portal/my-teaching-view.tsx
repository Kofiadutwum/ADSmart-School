"use client";

import { LoadState, useLoad } from "@/components/portal/kit";
import type { SchoolMe } from "@/lib/types";

/** A teacher's home (Phase 1 spec §7.3): what they teach and which class they look after, this
 * year, from their assignments. Class lists open from here once pupils arrive (Stage 8). */
export function MyTeachingView() {
  const { data, error } = useLoad<SchoolMe>("/api/school/me");
  const terms = data
    ? [...new Set([...data.teaching, ...data.class_teacher_of].map((row) => row.term))].sort()
    : [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">My teaching</h1>
        <p className="mt-1 text-ink-muted">Your classes and subjects this school year.</p>
      </div>
      <LoadState
        error={error}
        loading={!data && !error}
        empty={terms.length === 0}
        emptyText="No classes are assigned to you yet. The school's Administrator assigns them in School setup."
      />
      {data &&
        terms.map((term) => {
          const looked = data.class_teacher_of.filter((row) => row.term === term);
          const taught = data.teaching.filter((row) => row.term === term);
          return (
            <section key={term} aria-labelledby={`term-${term}`} className="surface rounded-card p-5 shadow-elev-1">
              <h2 id={`term-${term}`} className="text-lg font-semibold">
                Term {term}
              </h2>
              {looked.length > 0 && (
                <p className="mt-2">
                  Class teacher of <strong>{looked.map((row) => row.class).join(", ")}</strong>
                </p>
              )}
              {taught.length > 0 && (
                <ul className="mt-3 divide-y divide-line">
                  {taught.map((row) => (
                    <li key={row.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span className="font-medium">{row.subject}</span>
                      <span className="text-ink-muted">{row.class}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
    </div>
  );
}
