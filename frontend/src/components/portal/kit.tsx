"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Field, inputClasses } from "@/components/site/field";
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

/** A form's submit state: the alert, the field errors and the busy flag, with the server's
 * errors mapped onto the fields (Phase 1 spec §7.6). */
export function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  function fail(message: string, found: Record<string, string> = {}) {
    setError(message);
    setErrors(found);
    setAttempt((count) => count + 1);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      await action();
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  return { error, errors, attempt, busy, fail, run };
}

type InputFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "email" | "tel";
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
};

/** A labelled text or date input with its hint and error (spec §8.7). */
export function InputField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  hint,
  error,
  disabled,
}: InputFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} required={required} error={error}>
      {(props) => (
        <input
          {...props}
          type={type}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={inputClasses}
        />
      )}
    </Field>
  );
}

/** One-button actions: their own busy flag and the server's reason when they fail. */
export function useAction() {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (caught) {
      setProblem(firstProblem(caught));
    } finally {
      setBusy(false);
    }
  }
  const alert = problem ? (
    <p role="alert" className="text-sm text-danger">
      {problem}
    </p>
  ) : null;
  return { act, busy, alert };
}
