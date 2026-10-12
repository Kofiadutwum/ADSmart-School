"use client";

import { useEffect, useState, type ReactNode } from "react";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { errorMessage, fieldErrors, getJson } from "@/lib/client-api";

/** Small pieces every portal screen shares: loading, confirming and ticking. */
export const CHECK_FORM = "Please check the highlighted fields.";
export const textareaClasses = `${inputClasses} min-h-28`;

/** Loads a list or record once; `setData` keeps it in step with later changes. */
export function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getJson<T>(path).then(
      (body) => {
        if (!cancelled) setData(body);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path]);
  return { data, setData, error };
}

/** For one-button actions: the field's own reason when the server gives one. */
export function firstProblem(caught: unknown): string {
  return Object.values(fieldErrors(caught))[0] ?? errorMessage(caught);
}

export function ConfirmDelete({
  label = "Delete",
  busy = false,
  onConfirm,
}: {
  label?: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="outline" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>Delete for good?</span>
      <Button disabled={busy} onClick={onConfirm}>
        Yes, delete
      </Button>
      <Button variant="outline" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function Tick({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-indigo"
      />
      <span>{label}</span>
    </label>
  );
}

export function LoadState({
  error,
  loading,
  empty,
  emptyText,
}: {
  error: string | null;
  loading: boolean;
  empty: boolean;
  emptyText: string;
}) {
  if (error) {
    return (
      <p role="alert" className="text-danger">
        {error}
      </p>
    );
  }
  if (loading) return <p className="text-ink-muted">Loading…</p>;
  return empty ? <p className="text-ink-muted">{emptyText}</p> : null;
}
