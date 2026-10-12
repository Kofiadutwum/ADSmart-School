"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef, useState, type FormEvent, type PointerEvent } from "react";
import { InputField, LoadState, useLoad, useSubmit } from "@/components/portal/kit";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, putJson } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { todayInAccra } from "@/lib/dates";
import type { CalendarDayRow, CalendarDayType, CalendarMonth } from "@/lib/types";

const TYPES: Record<CalendarDayType, { label: string; short: string; tone: string }> = {
  OPEN: { label: "School open", short: "Open", tone: "bg-success/15" },
  HOLIDAY: { label: "Holiday", short: "Hol.", tone: "bg-copper/20" },
  CLOSING: { label: "Closing day", short: "Close", tone: "bg-indigo/15" },
  REOPENING: { label: "Reopening day", short: "Reopen", tone: "bg-violet/15" },
};
const CHOICES: [CalendarDayType | "NONE", string][] = [
  ["OPEN", "Open"],
  ["HOLIDAY", "Holiday"],
  ["CLOSING", "Closing day"],
  ["REOPENING", "Reopening day"],
  ["NONE", "Not a school day"],
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SWIPE = 40; // pixels before a swipe counts (spec §8.5)
const EDGE = 24; // swipes never start this close to the screen's edges: the phone's back gesture

function utc(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day || 1));
}

const dayName = (iso: string) =>
  utc(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
const monthName = (month: string) =>
  utc(month).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function shift(month: string, delta: number): string {
  const date = utc(month);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function daysOf(month: string): string[] {
  const day = utc(month);
  const days: string[] = [];
  while (day.toISOString().startsWith(month)) {
    days.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return days;
}

function describe(iso: string, row: CalendarDayRow | undefined): string {
  if (!row) return `${dayName(iso)}: not a school day`;
  return `${dayName(iso)}: ${TYPES[row.type].label}${row.note ? `, ${row.note}` : ""}`;
}

type Props = { canEdit: boolean; initialMonth?: string };

/** The school calendar, a month at a time (Phase 1 spec §7.2, §8.5): tap a day in a term to set
 * it; swipe or use the buttons to change month. */
export function CalendarView({ canEdit, initialMonth }: Props) {
  const [month, setMonth] = useState(initialMonth ?? todayInAccra().slice(0, 7));
  const { data, setData, error } = useLoad<CalendarMonth>(`/api/school/calendar?month=${month}`);
  const [editing, setEditing] = useState<string | null>(null);
  const start = useRef<number | null>(null);
  const shown = data?.month === month ? data : null;
  const rows = new Map(shown?.days.map((day) => [day.date, day]));
  const inTerm = (iso: string) => shown?.terms.some((term) => term.start_date <= iso && iso <= term.end_date) ?? false;
  const lead = (utc(month).getUTCDay() + 6) % 7; // weeks start on Monday

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const nearEdge = event.clientX < EDGE || event.clientX > window.innerWidth - EDGE;
    start.current = nearEdge ? null : event.clientX;
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (start.current === null) return;
    const moved = event.clientX - start.current;
    start.current = null;
    if (Math.abs(moved) >= SWIPE) setMonth((current) => shift(current, moved < 0 ? 1 : -1));
  }

  function saved(iso: string, row: CalendarDayRow | null) {
    if (!shown) return;
    const others = shown.days.filter((day) => day.date !== iso);
    const days = row ? [...others, row].sort((a, b) => a.date.localeCompare(b.date)) : others;
    setData({ ...shown, days });
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          className="px-3"
          aria-label="Previous month"
          onClick={() => setMonth(shift(month, -1))}
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Button>
        <h2 className="text-xl font-semibold" aria-live="polite">
          {monthName(month)}
        </h2>
        <Button variant="outline" className="px-3" aria-label="Next month" onClick={() => setMonth(shift(month, 1))}>
          <ChevronRight aria-hidden className="size-5" />
        </Button>
      </div>
      <LoadState error={error} loading={!shown && !error} empty={false} emptyText="" />
      {shown && shown.terms.length === 0 && (
        <p className="text-ink-muted">No term falls in this month. Add terms under Years and terms.</p>
      )}
      <div
        role="group"
        aria-label={`Days of ${monthName(month)}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="grid touch-pan-y grid-cols-7 gap-1 select-none"
      >
        {WEEKDAYS.map((name) => (
          <span key={name} aria-hidden className="py-1 text-center text-xs font-semibold text-ink-muted">
            {name}
          </span>
        ))}
        {Array.from({ length: lead }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden />
        ))}
        {daysOf(month).map((iso) => {
          const row = rows.get(iso);
          const content = (
            <>
              <span className="sr-only">{describe(iso, row)}</span>
              <span aria-hidden className="font-semibold">
                {Number(iso.slice(8))}
              </span>
              {row && (
                <span aria-hidden className="block truncate text-[0.7rem] leading-tight">
                  {TYPES[row.type].short}
                </span>
              )}
            </>
          );
          const classes = cn(
            "flex min-h-14 flex-col items-center justify-center rounded-control p-1 text-sm",
            row ? TYPES[row.type].tone : "text-ink-muted",
          );
          return canEdit && inTerm(iso) ? (
            <button
              key={iso}
              type="button"
              onClick={() => setEditing(iso)}
              className={cn(classes, "press cursor-pointer hover:ring-2 hover:ring-indigo/40")}
            >
              {content}
            </button>
          ) : (
            <div key={iso} className={classes}>
              {content}
            </div>
          );
        })}
      </div>
      <ul aria-label="Key" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {Object.entries(TYPES).map(([type, { label, short, tone }]) => (
          <li key={type} className="flex items-center gap-2">
            <span className={cn("rounded px-1.5 text-xs", tone)}>{short}</span>
            {label}
          </li>
        ))}
        <li className="text-ink-muted">Blank: not a school day</li>
      </ul>
      {editing && (
        <DayDialog
          iso={editing}
          row={rows.get(editing)}
          onSaved={(row) => saved(editing, row)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

type DayProps = {
  iso: string;
  row: CalendarDayRow | undefined;
  onSaved: (row: CalendarDayRow | null) => void;
  onClose: () => void;
};

function DayDialog({ iso, row, onSaved, onClose }: DayProps) {
  const [type, setType] = useState<CalendarDayType | "NONE">(row?.type ?? "OPEN");
  const [note, setNote] = useState(row?.note ?? "");
  const { error, errors, attempt, busy, run } = useSubmit();
  const url = `/api/school/calendar/${iso}`;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      if (type === "NONE") {
        await deleteJson(url);
        onSaved(null);
      } else {
        onSaved(await putJson<CalendarDayRow>(url, { type, note }));
      }
    });
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          aria-describedby={undefined}
          className="surface fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md space-y-4 rounded-card p-5 shadow-elev-2 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2"
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">{dayName(iso)}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="press inline-flex size-11 cursor-pointer items-center justify-center rounded-control hover:bg-ink/5"
              >
                <X aria-hidden className="size-5" />
              </button>
            </Dialog.Close>
          </div>
          <form noValidate onSubmit={onSubmit} className="space-y-4">
            <FormAlert message={error} focusKey={attempt} />
            <fieldset>
              <legend className="font-medium">This day is</legend>
              <div className="mt-1 grid gap-1">
                {CHOICES.map(([value, label]) => (
                  <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="day-type"
                      checked={type === value}
                      onChange={() => setType(value)}
                      className="size-5 accent-indigo"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {type !== "NONE" && (
              <InputField
                id="day-note"
                label="Note"
                hint="For example Sports day."
                value={note}
                onChange={setNote}
                error={errors.note}
              />
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                Save day
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
