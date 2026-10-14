"use client";

import { CircleCheck, CircleDashed } from "lucide-react";
import { LoadState, useLoad } from "@/components/portal/kit";
import { ghs } from "@/lib/money";
import type { SchoolDashboard } from "@/lib/types";

/** The Administrator's dashboard and the Head Teacher's school summary (Phase 1 spec §7.2–7.3). */
export function DashboardView() {
  const { data, error } = useLoad<SchoolDashboard>("/api/school/dashboard");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-ink-muted">Your school at a glance, and what is left before going live.</p>
      </div>
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && <Counts counts={data.counts} />}
      <Today />
      {data && <Checklist items={data.checklist} />}
    </div>
  );
}

function Counts({ counts }: { counts: SchoolDashboard["counts"] }) {
  const placed = counts.students_by_level.reduce((sum, level) => sum + level.count, 0);
  const cards: [string, number, string?][] = [
    [
      "Pupils",
      placed + counts.not_in_class,
      counts.not_in_class ? `${counts.not_in_class} not yet in a class` : undefined,
    ],
    ["Staff", counts.staff],
    ["Classes this year", counts.classes],
    ["New enquiries", counts.new_enquiries],
  ];
  return (
    <section aria-labelledby="counts-title" className="space-y-4">
      <h2 id="counts-title" className="sr-only">
        Counts
      </h2>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <div key={label} className="surface rounded-card p-4 shadow-elev-1">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
            {note && <dd className="mt-1 text-sm text-ink-muted">{note}</dd>}
          </div>
        ))}
      </dl>
      {counts.students_by_level.length > 0 && (
        <div className="surface rounded-card p-4 shadow-elev-1">
          <h3 className="font-semibold">Pupils by level</h3>
          <ul className="mt-2 divide-y divide-line">
            {counts.students_by_level.map((level) => (
              <li key={level.band} className="flex justify-between gap-4 py-2">
                <span>{level.label}</span>
                <span className="font-semibold tabular-nums">{level.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Checklist({ items }: { items: SchoolDashboard["checklist"] }) {
  const done = items.filter((item) => item.done).length;
  return (
    <section aria-labelledby="checklist-title" className="surface rounded-card p-5 shadow-elev-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="checklist-title" className="text-xl font-semibold">
          Go-live checklist
        </h2>
        <p className="text-sm text-ink-muted">
          {done} of {items.length} done
        </p>
      </div>
      <ul aria-label="Go-live checklist" className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-3">
            {item.done ? (
              <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
            ) : (
              <CircleDashed aria-hidden className="mt-0.5 size-5 shrink-0 text-copper" />
            )}
            <div>
              <p className="font-medium">
                <span className="sr-only">{item.done ? "Done: " : "To do: "}</span>
                {item.label}
                <span aria-hidden className="ml-2 text-sm font-normal text-ink-muted">
                  {item.done ? "Done" : "To do"}
                </span>
              </p>
              {item.detail && <p className="text-sm text-ink-muted">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type TodayFigures = {
  pupils: number;
  marked_today: number;
  present_today: number;
  absent_today: number;
  collected_today: number;
  outstanding_fees: number;
  debtors: number;
};

/** Today at school: the register and the money (SMS spec §31). */
function Today() {
  const { data } = useLoad<TodayFigures>("/api/school/dashboard-figures");
  if (!data) return null;
  const cards: [string, string, string?][] = [
    ["Present today", String(data.present_today), data.marked_today ? `of ${data.marked_today} marked` : "No register taken yet"],
    ["Absent today", String(data.absent_today)],
    ["Collected today", ghs(data.collected_today)],
    ["Fees still owed", ghs(data.outstanding_fees), `${data.debtors} pupils`],
  ];
  return (
    <section aria-labelledby="today-title" className="space-y-4">
      <h2 id="today-title" className="text-xl font-semibold">
        Today
      </h2>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <div key={label} className="rounded-card border border-line bg-card p-5">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
            {note && <dd className="mt-1 text-sm text-ink-muted">{note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
