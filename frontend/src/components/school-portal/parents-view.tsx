"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { InputField, LoadState, useAction, useLoad } from "@/components/portal/kit";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client-api";
import type { ActivationResult, ParentRow } from "@/lib/types";
import { activationMessage, RELATIONSHIPS } from "./pupil-tabs";

const PARENTS = "/api/school/parents";

/** Every parent, their children and whether they have activated their sign-in (P1 §5.2, §7.2).
 * New parents are added from a pupil's record, so each one starts linked to a child. */
export function ParentsView({ canEdit }: { canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const path = applied ? `${PARENTS}?q=${encodeURIComponent(applied)}` : PARENTS;
  const { data, setData, error } = useLoad<ParentRow[]>(path);
  const replace = (row: ParentRow) => setData((data ?? []).map((each) => (each.id === row.id ? row : each)));

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied(query.trim());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Parents</h1>
        <p className="mt-1 text-ink-muted">Add a parent from their child&apos;s record, under Parents.</p>
      </div>
      <form noValidate onSubmit={onSearch} aria-label="Find parents" className="flex flex-wrap items-end gap-3">
        <InputField id="parents-q" label="Name or mobile number" value={query} onChange={setQuery} />
        <Button type="submit">Search</Button>
      </form>
      <LoadState error={error} loading={!data && !error} empty={data?.length === 0} emptyText="No parents match." />
      <ul className="grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((row) => (
          <li key={row.id}>
            <ParentCard row={row} canEdit={canEdit} onSaved={replace} />
          </li>
        ))}
      </ul>
    </div>
  );
}

type CardProps = { row: ParentRow; canEdit: boolean; onSaved: (row: ParentRow) => void };

function ParentCard({ row, canEdit, onSaved }: CardProps) {
  const { act, busy, alert } = useAction();
  const [notice, setNotice] = useState<string | null>(null);
  const titleId = `parent-${row.id}`;
  const url = `${PARENTS}/${row.id}`;
  const activate = () =>
    act(async () => setNotice(activationMessage(await postJson<ActivationResult>(`${url}/activation`))));
  const reset = () =>
    act(async () => {
      const result = await postJson<ActivationResult>(`${url}/reset`);
      setNotice(`Access reset: they are signed out. ${activationMessage(result)}`);
    });
  const makeReal = () => act(async () => onSaved(await postJson<ParentRow>(`${url}/make-real`)));

  return (
    <article aria-labelledby={titleId} className="surface space-y-3 rounded-card p-5 shadow-elev-1">
      <h2 id={titleId} className="text-lg font-semibold">
        {row.name}
      </h2>
      <p className="text-sm text-ink-muted">
        {row.phone}
        {row.email && ` · ${row.email}`}
      </p>
      <p className="text-sm">
        {row.activated ? "Activated" : "Not activated yet"}
        {row.is_demo && " · Demo"}
      </p>
      {row.children.length > 0 && (
        <ul className="space-y-1 text-sm">
          {row.children.map((child) => (
            <li key={child.guardianship}>
              <Link
                href={`/pupils/${child.student}`}
                className="font-semibold text-indigo underline-offset-4 hover:underline"
              >
                {child.name}
              </Link>{" "}
              <span className="text-ink-muted">({RELATIONSHIPS[child.relationship]})</span>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={busy} onClick={() => void activate()}>
            Send activation text
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void reset()}>
            Reset access
          </Button>
          {row.is_demo && (
            <Button variant="outline" disabled={busy} onClick={() => void makeReal()}>
              This is now a real record
            </Button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {alert}
    </article>
  );
}
