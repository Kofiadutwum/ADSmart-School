"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, getJson, patchJson, postJson } from "@/lib/client-api";
import { ghs, toCedis, toPesewas } from "@/lib/money";
import { CHECK_FORM, ConfirmDelete, firstProblem, LoadState, textareaClasses, useLoad, useSubmit } from "./kit";

export type Choice = readonly [string, string];

/** One field of a register: how it is entered and how it is shown. */
export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "money" | "date" | "time" | "boolean" | "choice" | "option" | "list";
  /** For "choice": the stored value and what people read. */
  choices?: readonly Choice[];
  /** For "option": a list from /api/school/options/<kind>, or a full API path. */
  options?: string;
  required?: boolean;
  hint?: string;
  /** Shown on each row but never entered (worked out by the school's server). */
  readOnly?: boolean;
};

export type Row = Record<string, unknown> & { id: number };

const optionCache = new Map<string, Promise<{ id: number; name: string }[]>>();

function optionsPath(source: string): string {
  return source.startsWith("/") ? source : `/api/school/options/${source}`;
}

export function useOptions(source: string | undefined) {
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (!source) return;
    const path = optionsPath(source);
    if (!optionCache.has(path)) {
      const loading = getJson<{ id: number; name: string }[]>(path);
      loading.catch(() => optionCache.delete(path));
      optionCache.set(path, loading);
    }
    let live = true;
    optionCache.get(path)?.then(
      (found) => live && setItems(found),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [source]);
  return items;
}

/** How a stored value reads on screen. */
export function display(field: FieldSpec, row: Row): string {
  const value = row[field.name];
  if (field.type === "option") {
    const label = row[`${field.name}_label`];
    return typeof label === "string" && label ? label : value ? String(value) : "—";
  }
  if (value === null || value === undefined || value === "") return "—";
  switch (field.type) {
    case "money":
      return ghs(Number(value));
    case "boolean":
      return value ? "Yes" : "No";
    case "choice":
      return field.choices?.find(([stored]) => stored === value)?.[1] ?? String(value);
    case "list":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "date":
      return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    default:
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
      }
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

type Values = Record<string, string | boolean>;

function startValues(fields: FieldSpec[], row?: Row): Values {
  const values: Values = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    const value = row?.[field.name];
    if (field.type === "boolean") values[field.name] = Boolean(value);
    else if (field.type === "money") values[field.name] = row ? toCedis(value as number) : "";
    else if (field.type === "list") values[field.name] = Array.isArray(value) ? value.join(", ") : "";
    else values[field.name] = value === null || value === undefined ? "" : String(value);
  }
  return values;
}

function payload(fields: FieldSpec[], values: Values): { data: Record<string, unknown>; problems: Record<string, string> } {
  const data: Record<string, unknown> = {};
  const problems: Record<string, string> = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    const raw = values[field.name];
    if (field.type === "boolean") {
      data[field.name] = Boolean(raw);
      continue;
    }
    const text = String(raw ?? "").trim();
    if (!text) {
      if (field.required) problems[field.name] = `Enter ${field.label.toLowerCase()}.`;
      else data[field.name] = ["date", "time", "option", "number", "money"].includes(field.type ?? "") ? null : "";
      continue;
    }
    if (field.type === "money") {
      const pesewas = toPesewas(text);
      if (pesewas === null) problems[field.name] = "Enter an amount in cedis, for example 150.00.";
      else data[field.name] = pesewas;
    } else if (field.type === "number" || field.type === "option") {
      if (Number.isNaN(Number(text))) problems[field.name] = "Enter a number.";
      else data[field.name] = Number(text);
    } else if (field.type === "list") {
      data[field.name] = text.split(",").map((part) => part.trim()).filter(Boolean);
    } else {
      data[field.name] = text;
    }
  }
  return { data, problems };
}

function FieldInput({
  field,
  id,
  value,
  onChange,
  error,
}: {
  field: FieldSpec;
  id: string;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  error?: string;
}) {
  const options = useOptions(field.type === "option" ? field.options : undefined);
  if (field.type === "boolean") {
    return (
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="size-5 accent-indigo"
        />
        <span className="font-medium">{field.label}</span>
      </label>
    );
  }
  const hint = field.type === "money" ? (field.hint ?? "In cedis, for example 150.00") : field.hint;
  return (
    <Field id={id} label={field.label} hint={hint} required={field.required} error={error}>
      {(props) => {
        const common = {
          ...props,
          value: String(value),
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
        };
        if (field.type === "textarea") return <textarea {...common} className={textareaClasses} />;
        if (field.type === "choice" || field.type === "option") {
          const list: readonly Choice[] =
            field.type === "choice" ? (field.choices ?? []) : options.map((item) => [String(item.id), item.name] as const);
          return (
            <select {...common} className={inputClasses}>
              <option value="">Choose…</option>
              {list.map(([stored, label]) => (
                <option key={stored} value={stored}>
                  {label}
                </option>
              ))}
            </select>
          );
        }
        const types: Record<string, string> = { date: "date", time: "time", number: "number" };
        const type = types[field.type ?? ""] ?? "text";
        return (
          <input
            {...common}
            type={type}
            inputMode={field.type === "money" ? "decimal" : undefined}
            className={inputClasses}
          />
        );
      }}
    </Field>
  );
}

export function RecordForm({
  fields,
  idPrefix,
  submitLabel,
  row,
  send,
  onSaved,
  onCancel,
}: {
  fields: FieldSpec[];
  idPrefix: string;
  submitLabel: string;
  row?: Row;
  send: (data: Record<string, unknown>) => Promise<Row>;
  onSaved: (row: Row) => void;
  onCancel?: () => void;
}) {
  const editable = fields.filter((field) => !field.readOnly);
  const [values, setValues] = useState<Values>(() => startValues(editable, row));
  const { error, errors, attempt, busy, run, fail } = useSubmit();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { data, problems } = payload(editable, values);
    if (Object.keys(problems).length) return fail(CHECK_FORM, problems);
    void run(async () => {
      onSaved(await send(data));
      if (!row) setValues(startValues(editable));
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-4 sm:grid-cols-2">
        {editable.map((field) => (
          <div key={field.name} className={field.type === "textarea" ? "sm:col-span-2" : undefined}>
            <FieldInput
              field={field}
              id={`${idPrefix}-${field.name}`}
              value={values[field.name] ?? ""}
              error={errors[field.name]}
              onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

type Props = {
  /** The register's API path, e.g. /api/school/finance/fees. */
  path: string;
  /** Added to the list request, e.g. "status=PENDING". */
  query?: string;
  noun: string;
  fields: FieldSpec[];
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  emptyText?: string;
  /** Extra buttons on each row, e.g. Approve. */
  actions?: (row: Row, replace: (row: Row) => void, reload: () => void) => ReactNode;
  /** The row's heading; the first field by default. */
  title?: (row: Row) => string;
};

/** A register: list, add, edit and remove, described by its fields (SMS spec §§13–37). */
export function RecordsView({
  path,
  query,
  noun,
  fields,
  canAdd = false,
  canEdit = false,
  canDelete = false,
  emptyText,
  actions,
  title,
}: Props) {
  const { data, setData, error, reload } = useLoad<Row[]>(query ? `${path}?${query}` : path);
  const [adding, setAdding] = useState(false);
  const rows = data ?? [];
  const replace = (row: Row) => setData([row, ...rows.filter((each) => each.id !== row.id)]);
  const idPrefix = noun.toLowerCase().replaceAll(" ", "-");

  return (
    <div className="space-y-6">
      {canAdd &&
        (adding ? (
          <section className="rounded-card border border-line bg-card p-5">
            <h2 className="mb-4 text-lg font-semibold">Add {noun}</h2>
            <RecordForm
              fields={fields}
              idPrefix={`new-${idPrefix}`}
              submitLabel={`Add ${noun}`}
              send={(body) => postJson<Row>(path, body)}
              onSaved={(row) => {
                replace(row);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </section>
        ) : (
          <Button onClick={() => setAdding(true)}>Add {noun}</Button>
        ))}
      <LoadState
        error={error}
        loading={!data && !error}
        empty={rows.length === 0}
        emptyText={emptyText ?? `Nothing here yet.`}
      />
      <ul className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id}>
            <RecordCard
              row={row}
              fields={fields}
              path={path}
              idPrefix={idPrefix}
              canEdit={canEdit}
              canDelete={canDelete}
              title={title}
              onSaved={replace}
              onDeleted={() => setData(rows.filter((each) => each.id !== row.id))}
              actions={actions ? actions(row, replace, reload) : null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecordCard({
  row,
  fields,
  path,
  idPrefix,
  canEdit,
  canDelete,
  title,
  onSaved,
  onDeleted,
  actions,
}: {
  row: Row;
  fields: FieldSpec[];
  path: string;
  idPrefix: string;
  canEdit: boolean;
  canDelete: boolean;
  title?: (row: Row) => string;
  onSaved: (row: Row) => void;
  onDeleted: () => void;
  actions: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [first, ...rest] = fields;
  const heading = title ? title(row) : first ? display(first, row) : `#${row.id}`;

  if (editing) {
    return (
      <article className="rounded-card border border-line bg-card p-5">
        <RecordForm
          fields={fields}
          idPrefix={`${idPrefix}-${row.id}`}
          submitLabel="Save changes"
          row={row}
          send={(body) => patchJson<Row>(`${path}/${row.id}`, body)}
          onSaved={(saved) => {
            onSaved(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </article>
    );
  }

  async function remove() {
    setBusy(true);
    setProblem(null);
    try {
      await deleteJson(`${path}/${row.id}`);
      onDeleted();
    } catch (caught) {
      setProblem(firstProblem(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="h-full rounded-card border border-line bg-card p-5">
      <h3 className="font-semibold">{heading}</h3>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {(title ? fields : rest)
          .filter((field) => field.type !== "textarea" || row[field.name])
          .map((field) => (
            <div key={field.name} className="contents">
              <dt className="text-ink-muted">{field.label}</dt>
              <dd className="min-w-0 break-words">{display(field, row)}</dd>
            </div>
          ))}
      </dl>
      {(canEdit || canDelete || actions) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canEdit && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {canDelete && <ConfirmDelete busy={busy} onConfirm={() => void remove()} />}
          {actions}
        </div>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {problem}
        </p>
      )}
    </article>
  );
}
