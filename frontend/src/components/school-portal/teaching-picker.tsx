"use client";

import { useState, type FormEvent } from "react";
import { Tick, useSubmit } from "@/components/portal/kit";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { postJson } from "@/lib/client-api";
import type { ClassesData, SubjectRow } from "@/lib/types";

type Result = {
  added: unknown[];
  replaced: { teacher: string; subject: string; class: string; term: number }[];
  skipped: { subject: string; class: string }[];
};

function summary({ added, replaced, skipped }: Result): string {
  const lines = [
    added.length === 0
      ? "Nothing new to add."
      : `Added ${added.length} ${added.length === 1 ? "assignment" : "assignments"}.`,
    ...replaced.map((each) => `Replaced ${each.teacher} for ${each.subject}, ${each.class} (Term ${each.term}).`),
    ...skipped.map((each) => `Skipped ${each.subject} for ${each.class}: not studied at that level.`),
  ];
  return lines.join(" ");
}

type Props = {
  data: ClassesData;
  subjects: SubjectRow[];
  /** The teacher, when the form is on their own page; otherwise the form asks. */
  staffId?: number;
  onDone: () => void;
};

/** One teacher, several subjects in several classes at once, for one term or the whole year.
 * Whoever else taught a ticked subject to a ticked class is replaced. */
export function TeachingPicker({ data, subjects, staffId, onDone }: Props) {
  const [staff, setStaff] = useState("");
  const [chosenSubjects, setChosenSubjects] = useState<number[]>([]);
  const [chosenClasses, setChosenClasses] = useState<number[]>([]);
  const [term, setTerm] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const { error, errors, attempt, busy, run, fail } = useSubmit();

  const toggle = (list: number[], id: number, on: boolean) => (on ? [...list, id] : list.filter((each) => each !== id));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(null);
    const missing: Record<string, string> = {};
    if (!staffId && !staff) missing.staff = "Choose one.";
    if (chosenSubjects.length === 0) missing.subjects = "Tick at least one.";
    if (chosenClasses.length === 0) missing.classes = "Tick at least one.";
    if (Object.keys(missing).length > 0) return fail("Please check the highlighted fields.", missing);
    const body = {
      staff: staffId ?? Number(staff),
      subjects: subjects.map((each) => each.id).filter((id) => chosenSubjects.includes(id)),
      classes: data.classes.map((each) => each.id).filter((id) => chosenClasses.includes(id)),
      term: term ? Number(term) : null,
    };
    void run(async () => {
      setDone(summary(await postJson<Result>("/api/school/teaching/bulk", body)));
      setChosenSubjects([]);
      setChosenClasses([]);
      onDone();
    });
  }

  const ticks = (
    name: "subjects" | "classes",
    legend: string,
    options: { id: number; name: string }[],
    chosen: number[],
    setChosen: (list: number[]) => void,
  ) => (
    <fieldset aria-describedby={errors[name] ? `picker-${name}-error` : undefined}>
      <legend className="font-medium">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-x-6">
        {options.map((option) => (
          <Tick
            key={option.id}
            label={option.name}
            checked={chosen.includes(option.id)}
            onChange={(on) => setChosen(toggle(chosen, option.id, on))}
          />
        ))}
      </div>
      {errors[name] && (
        <p id={`picker-${name}-error`} className="mt-1 text-sm text-danger">
          {errors[name]}
        </p>
      )}
    </fieldset>
  );

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Assign teaching" className="space-y-4">
      <FormAlert message={error} focusKey={attempt} />
      {!staffId && (
        <Field id="picker-staff" label="Teacher" required error={errors.staff} className="w-full max-w-xs">
          {(props) => (
            <select {...props} value={staff} onChange={(event) => setStaff(event.target.value)} className={inputClasses}>
              <option value="">Choose…</option>
              {data.teachers.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {ticks("subjects", "Subjects", subjects, chosenSubjects, setChosenSubjects)}
      {ticks("classes", "Classes", data.classes, chosenClasses, setChosenClasses)}
      <Field id="picker-term" label="Term" error={errors.term} className="w-full max-w-xs">
        {(props) => (
          <select {...props} value={term} onChange={(event) => setTerm(event.target.value)} className={inputClasses}>
            <option value="">Whole school year</option>
            {data.terms.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <p className="text-sm text-ink-muted">
        The teacher gets every ticked subject in every ticked class that studies it, and replaces whoever taught it
        there.
      </p>
      <Button type="submit" disabled={busy}>
        {busy ? "Assigning…" : "Assign"}
      </Button>
      {done && (
        <p role="status" className="text-sm">
          {done}
        </p>
      )}
    </form>
  );
}
