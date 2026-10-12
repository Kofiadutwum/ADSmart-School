"use client";

import { useState, type FormEvent } from "react";
import { InputField, LoadState, useLoad } from "@/components/portal/kit";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import type { SchoolAudit } from "@/lib/types";

const AUDIT = "/api/school/audit";
const RECORD_TYPES: Record<string, string> = {
  "accounts.user": "Sign-in account",
  "academics.academicyear": "School year",
  "academics.calendarday": "Calendar day",
  "academics.classteacherassignment": "Class teacher",
  "academics.schoolclass": "Class",
  "academics.subject": "Subject",
  "academics.teachingassignment": "Teaching",
  "academics.term": "Term",
  "consent.consent": "Consent",
  "people.parent": "Parent",
  "people.staff": "Staff",
  "people.student": "Pupil",
  "school.school": "School profile",
  "website.enquiry": "Enquiry",
};
const recordType = (name: string) => RECORD_TYPES[name] ?? name;

type Filters = { actor: string; entity_type: string; entity_id: string; date_from: string; date_to: string };
const NONE: Filters = { actor: "", entity_type: "", entity_id: "", date_from: "", date_to: "" };

function pathFor(filters: Filters): string {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value.trim())).toString();
  return query ? `${AUDIT}?${query}` : AUDIT;
}

/** The school's audit log (Phase 1 spec §7.2), filtered by person, record type, record or date. */
export function SchoolAuditView() {
  const [filters, setFilters] = useState<Filters>(NONE);
  const [applied, setApplied] = useState<Filters>(NONE);
  const { data, error } = useLoad<SchoolAudit>(pathFor(applied));
  const set = (name: keyof Filters) => (value: string) => setFilters({ ...filters, [name]: value });
  const people: [string, string][] = (data?.people ?? []).map((person) => [String(person.id), person.name]);
  const types: [string, string][] = (data?.record_types ?? []).map((name) => [name, recordType(name)]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied(filters);
  }

  const select = (name: "actor" | "entity_type", label: string, options: [string, string][]) => (
    <Field id={`audit-${name}`} label={label}>
      {(props) => (
        <select
          {...props}
          value={filters[name]}
          onChange={(event) => set(name)(event.target.value)}
          className={inputClasses}
        >
          <option value="">All</option>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Audit log</h1>
        <p className="mt-1 text-ink-muted">Every change made in the school&apos;s portal, newest first.</p>
      </div>
      <form
        noValidate
        onSubmit={onSubmit}
        aria-label="Filter the log"
        className="surface grid gap-4 rounded-card p-5 shadow-elev-1 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        {select("actor", "Person", people)}
        {select("entity_type", "Record type", types)}
        <InputField id="audit-record" label="Record number" value={filters.entity_id} onChange={set("entity_id")} />
        <InputField id="audit-from" label="From" type="date" value={filters.date_from} onChange={set("date_from")} />
        <InputField id="audit-to" label="To" type="date" value={filters.date_to} onChange={set("date_to")} />
        <div className="flex gap-3 sm:col-span-2 lg:col-span-5">
          <Button type="submit">Show</Button>
          <Button
            variant="outline"
            onClick={() => {
              setFilters(NONE);
              setApplied(NONE);
            }}
          >
            Clear
          </Button>
        </div>
      </form>
      <LoadState
        error={error}
        loading={!data && !error}
        empty={data?.entries.length === 0}
        emptyText="Nothing matches these filters."
      />
      {data && data.entries.length > 0 && (
        <div className="surface overflow-x-auto rounded-card shadow-elev-1">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-muted">
              <tr>
                {["When", "Who", "What", "Record", "Reason"].map((heading) => (
                  <th key={heading} scope="col" className="p-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="p-3 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
                  <td className="p-3">{entry.actor_name || "The system"}</td>
                  <td className="p-3">{entry.action_label}</td>
                  <td className="p-3">
                    {entry.entity_type ? `${recordType(entry.entity_type)} ${entry.entity_id}` : ""}
                  </td>
                  <td className="p-3">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
