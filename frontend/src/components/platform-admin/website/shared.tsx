"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { errorMessage, fieldErrors, getJson } from "@/lib/client-api";

export const WEBSITE_API = "/api/platform/website";
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

export function moved<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  return next;
}

type OrderProps = { label: string; index: number; count: number; disabled?: boolean; onMove: (delta: -1 | 1) => void };

/** Up and down buttons: the keyboard-friendly way to reorder (business tools spec §5.2). */
export function OrderButtons({ label, index, count, disabled = false, onMove }: OrderProps) {
  return (
    <span className="inline-flex gap-2">
      <Button
        variant="outline"
        className="px-3"
        aria-label={`Move ${label} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp aria-hidden className="size-4" />
      </Button>
      <Button
        variant="outline"
        className="px-3"
        aria-label={`Move ${label} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown aria-hidden className="size-4" />
      </Button>
    </span>
  );
}

export function ConfirmDelete({ label = "Delete", busy = false, onConfirm }: { label?: string; busy?: boolean; onConfirm: () => void }) {
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

export function Tick({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
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

export function LoadState({ error, loading, empty, emptyText }: { error: string | null; loading: boolean; empty: boolean; emptyText: string }) {
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
