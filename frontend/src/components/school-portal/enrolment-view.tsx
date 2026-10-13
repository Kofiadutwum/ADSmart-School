"use client";

import { useState } from "react";
import { InputField, LoadState, useAction, useLoad } from "@/components/portal/kit";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client-api";
import { todayInAccra } from "@/lib/dates";
import type { ClassesData, EnrolmentOverview, PupilRow } from "@/lib/types";

const pupils = (count: number) => (count === 1 ? "1 pupil" : `${count} pupils`);

/** Placing pupils in classes, one or many at a time (Phase 1 spec §7.2). A pupil already in a
 * class this year moves, and their history is kept. */
export function EnrolmentView() {
  const classes = useLoad<ClassesData>("/api/school/classes");
  const [showing, setShowing] = useState("none");
  const list = useLoad<PupilRow[]>(`/api/school/pupils?class=${showing}`);
  const [chosen, setChosen] = useState<number[]>([]);
  const [target, setTarget] = useState("");
  const [start, setStart] = useState(todayInAccra());
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { act, busy, alert } = useAction();
  const rows = list.data ?? [];
  const options = classes.data?.classes ?? [];

  function toggle(id: number, on: boolean) {
    setChosen(on ? [...chosen, id] : chosen.filter((each) => each !== id));
  }

  function place() {
    setNotice(null);
    setProblem(null);
    if (!target) return setProblem("Choose a class.");
    void act(async () => {
      const body = { students: chosen, school_class: Number(target), start_date: start };
      const result = await postJson<{ placed: number; already: number }>("/api/school/enrolments", body);
      const already = result.already ? ` ${pupils(result.already)} already there.` : "";
      setNotice(`Placed ${pupils(result.placed)}.${already}`);
      setChosen([]);
      list.reload();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Enrolment</h1>
        <p className="mt-1 text-ink-muted">Tick pupils, choose their class, and place them together.</p>
      </div>
      {classes.data && !classes.data.year && (
        <p className="text-ink-muted">Add the current school year and its classes first, under School setup.</p>
      )}
      <div className="surface grid gap-4 rounded-card p-5 shadow-elev-1 sm:grid-cols-3 sm:items-end">
        <Field id="enrol-showing" label="Show">
          {(props) => (
            <select
              {...props}
              value={showing}
              onChange={(event) => {
                setShowing(event.target.value);
                setChosen([]);
              }}
              className={inputClasses}
            >
              <option value="none">Pupils not yet in a class</option>
              {options.map((row) => (
                <option key={row.id} value={row.id}>
                  Pupils now in {row.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="enrol-target" label="Place in" required error={problem ?? undefined}>
          {(props) => (
            <select
              {...props}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className={inputClasses}
            >
              <option value="">Choose…</option>
              {options.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <InputField id="enrol-start" label="From" type="date" required value={start} onChange={setStart} />
      </div>
      <LoadState
        error={list.error}
        loading={!list.data && !list.error}
        empty={rows.length === 0}
        emptyText="No pupils to show."
      />
      {rows.length > 0 && (
        <fieldset className="surface rounded-card p-5 shadow-elev-1">
          <legend className="sr-only">Pupils</legend>
          <label className="flex min-h-11 items-center gap-3 border-b border-line pb-2 font-semibold">
            <input
              type="checkbox"
              checked={chosen.length === rows.length}
              onChange={(event) => setChosen(event.target.checked ? rows.map((row) => row.id) : [])}
              className="size-5 accent-indigo"
            />
            Select all
          </label>
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={chosen.includes(row.id)}
                    onChange={(event) => toggle(row.id, event.target.checked)}
                    className="size-5 accent-indigo"
                  />
                  {row.name}
                </label>
                <span className="text-sm text-ink-muted">{row.student_id}</span>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || chosen.length === 0} onClick={place}>
          Place {pupils(chosen.length)}
        </Button>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </div>
      {alert}
    </div>
  );
}

/** The Proprietor's read-only view: how many pupils, by level and class (P1 §7.3). */
export function OverviewView() {
  const { data, error } = useLoad<EnrolmentOverview>("/api/school/enrolment-overview");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Enrolment overview</h1>
        {data?.year && <p className="mt-1 text-ink-muted">School year {data.year}</p>}
      </div>
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <>
          <p className="text-lg">
            {pupils(data.total)} in all{data.not_in_class ? `, ${data.not_in_class} not yet in a class` : ""}.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.levels.map((level) => (
              <section
                key={level.band}
                aria-labelledby={`level-${level.band}`}
                className="surface space-y-3 rounded-card p-5 shadow-elev-1"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id={`level-${level.band}`} className="text-lg font-semibold">
                    {level.label}
                  </h2>
                  <span className="text-sm text-ink-muted">{pupils(level.count)}</span>
                </div>
                {level.classes.length === 0 ? (
                  <p className="text-sm text-ink-muted">No classes this year.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">Class</th>
                        <th scope="col">Pupils</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {level.classes.map((row) => (
                        <tr key={row.id}>
                          <td className="py-2">{row.name}</td>
                          <td className="py-2 text-right tabular-nums">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
