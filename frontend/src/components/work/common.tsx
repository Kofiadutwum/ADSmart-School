"use client";

import { useState, type ReactNode } from "react";
import { useAction } from "@/components/portal/kit";
import { useOptions } from "@/components/portal/records-view";
import { SectionTabs } from "@/components/portal/section-tabs";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { patchJson, postJson } from "@/lib/client-api";
import { ghs } from "@/lib/money";
import { useActiveRole } from "@/components/school-portal/school-portal-shell";

/** The page title and a line saying what the page is for. */
export function PageHead({ title, intro, children }: { title: string; intro?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {intro && <p className="mt-1 max-w-prose text-ink-muted">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

/** A screen with tabs along the top: the title, the tabs, then the page. */
export function Section({
  title,
  intro,
  tabs,
  children,
}: {
  title: string;
  intro?: string;
  tabs?: readonly (readonly [string, string])[];
  children: ReactNode;
}) {
  return (
    <div>
      <PageHead title={title} intro={intro} />
      {tabs && tabs.length > 1 && <SectionTabs label={title} tabs={tabs} />}
      {children}
    </div>
  );
}

/** True when the person is using the portal as one of these roles. */
export function useRoleIs(...names: string[]): boolean {
  const role = useActiveRole();
  return role !== null && names.includes(role);
}

/** A drop-down of the school's pupils, classes, terms and so on. */
export function Picker({
  id,
  label,
  source,
  value,
  onChange,
  includeAll,
}: {
  id: string;
  label: string;
  source: string;
  value: string;
  onChange: (value: string) => void;
  includeAll?: string;
}) {
  const items = useOptions(source);
  return (
    <label htmlFor={id} className="block text-sm font-medium">
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClasses} mt-1 min-h-11 py-2`}
      >
        <option value="">{includeAll ?? "Choose…"}</option>
        {items.map((item) => (
          <option key={item.id} value={String(item.id)}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A date input with its label, for filters. */
export function DatePick({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium">
      {label}
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClasses} mt-1 min-h-11 py-2`}
      />
    </label>
  );
}

export function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** A headline number. */
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-card border border-line bg-card p-5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="mt-1 text-sm text-ink-muted">{note}</dd>}
    </div>
  );
}

export function Money({ value }: { value: number | null | undefined }) {
  return <span className="tabular-nums">{ghs(value)}</span>;
}

/** A one-click action (Approve, Send, Close the day…), with an optional second "Are you sure?". */
export function ActButton({
  label,
  path,
  body,
  confirm,
  variant = "outline",
  method = "post",
  onDone,
}: {
  label: string;
  path: string;
  body?: unknown;
  confirm?: string;
  variant?: "outline" | "primary";
  method?: "post" | "patch";
  onDone?: (result: unknown) => void;
}) {
  const { act, busy, alert } = useAction();
  const [asking, setAsking] = useState(false);
  const run = () =>
    act(async () => {
      const result = method === "patch" ? await patchJson<unknown>(path, body) : await postJson<unknown>(path, body);
      setAsking(false);
      onDone?.(result);
    });
  return (
    <span className="inline-flex flex-col gap-1">
      {asking ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{confirm}</span>
          <Button disabled={busy} onClick={() => void run()}>
            Yes
          </Button>
          <Button variant="outline" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button
          variant={variant === "primary" ? undefined : "outline"}
          disabled={busy}
          onClick={() => (confirm ? setAsking(true) : void run())}
        >
          {busy ? "Working…" : label}
        </Button>
      )}
      {alert}
    </span>
  );
}

/** A simple table: headers and rows of cells. Scrolls sideways on phones. */
export function Table({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card">
      <table className="w-full min-w-[32rem] text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-line text-ink-muted">
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col" className="px-4 py-3 font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-line last:border-0">
              {row.map((cell, column) => (
                <td key={column} className="px-4 py-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A labelled card around a part of a page. */
export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-4 rounded-card border border-line bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** The status words the server sends, readable. */
export function words(value: unknown): string {
  const text = String(value ?? "");
  return text ? text.charAt(0) + text.slice(1).toLowerCase().replaceAll("_", " ") : "—";
}

export function when(value: unknown): string {
  if (!value) return "—";
  const text = String(value);
  return /T/.test(text)
    ? new Date(text).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : new Date(`${text}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
