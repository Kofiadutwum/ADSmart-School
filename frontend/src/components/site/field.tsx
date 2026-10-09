import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

export const inputClasses =
  "block min-h-12 w-full rounded-control border border-line bg-card px-4 py-3 text-base text-ink placeholder:text-ink-muted aria-[invalid=true]:border-danger";

type InputProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: true; required?: boolean };

type Props = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: InputProps) => ReactNode;
};

/** Label, hint and error wired to the input for screen readers (spec §8.7). */
export function Field({ id, label, hint, error, required = false, className, children }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block font-medium">
        {label}
        {required ? (
          <span aria-hidden className="text-danger">
            {" "}*
          </span>
        ) : (
          <span className="font-normal text-ink-muted"> (optional)</span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      <div className="mt-2">
        {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
      </div>
      {error && (
        <p id={errorId} className="mt-2 flex items-start gap-1.5 text-sm font-medium text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
