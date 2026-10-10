"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { inputClasses } from "@/components/site/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { errorMessage, getJson } from "@/lib/client-api";
import { formatDate } from "@/lib/dates";
import type { SchoolRow, SchoolStatus } from "@/lib/types";
import { STATUS_LABEL, StatusBadge } from "./status-badge";

/** Every school on the platform (amendment §5), with search and a status filter. */
export function SchoolsView() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [schools, setSchools] = useState<SchoolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
    getJson<SchoolRow[]>(`/api/platform/schools${query ? `?${query}` : ""}`).then(
      (rows) => {
        if (cancelled) return;
        setSchools(rows);
        setError(null);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [filters]);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: search.trim() }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Schools</h1>
        <ButtonLink href="/schools/new">Add a school</ButtonLink>
      </div>

      <form role="search" onSubmit={onSearch} className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="block text-sm font-medium">Search by name, web address or town</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label>
          <span className="block text-sm font-medium">Status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className={`${inputClasses} mt-1`}
          >
            <option value="">All</option>
            {(Object.keys(STATUS_LABEL) as SchoolStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {schools === null && !error && <p className="text-ink-muted">Loading…</p>}
      {schools?.length === 0 && <p className="text-ink-muted">No schools match.</p>}
      {schools && schools.length > 0 && (
        <ul className="grid gap-3">
          {schools.map((school) => (
            <li key={school.slug}>
              <Link
                href={`/schools/${school.slug}`}
                className="surface flex flex-wrap items-center justify-between gap-3 rounded-card p-4 hover:shadow-elev-2"
              >
                <span>
                  <span className="block font-semibold">{school.name}</span>
                  <span className="block text-sm text-ink-muted">
                    {school.town}, {school.region} · added {formatDate(school.created_at)}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span>{school.is_public ? "Website live" : `Preview · ${school.to_do} to do`}</span>
                  <StatusBadge status={school.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
