"use client";

import { useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { deleteJson, errorMessage, fieldErrors, patchJson, postForm, postJson } from "@/lib/client-api";
import type { AdminTestimonial } from "@/lib/types";
import {
  CHECK_FORM,
  ConfirmDelete,
  LoadState,
  OrderButtons,
  Tick,
  WEBSITE_API,
  firstProblem,
  moved,
  textareaClasses,
  useLoad,
} from "./shared";

const URL = `${WEBSITE_API}/testimonials`;
const PERMISSION_LABEL = "This person agreed to have their words and name published";

type Values = {
  quote: string;
  person_name: string;
  person_role: string;
  school_name: string;
  school_slug: string;
  permission: boolean;
  visible: boolean;
};
const EMPTY: Values = {
  quote: "",
  person_name: "",
  person_role: "",
  school_name: "",
  school_slug: "",
  permission: false,
  visible: true,
};

/** Comments from schools on your website (business tools spec §5.5). */
export function TestimonialsManager() {
  const { data: comments, setData: setComments, error } = useLoad<AdminTestimonial[]>(URL);
  const [problem, setProblem] = useState<string | null>(null);
  const replace = (saved: AdminTestimonial) =>
    setComments((list) => list?.map((row) => (row.id === saved.id ? saved : row)) ?? null);

  async function move(index: number, delta: -1 | 1) {
    if (!comments) return;
    try {
      const ids = moved(comments, index, delta).map((comment) => comment.id);
      setComments(await postJson<AdminTestimonial[]>(`${URL}/order`, { ids }));
    } catch (caught) {
      setProblem(errorMessage(caught));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Comments from schools</h1>
        <p className="mt-1 text-ink-muted">
          What schools say about your service. Up to 3 show on the home page, and only with the person&apos;s permission.
        </p>
      </div>
      <CommentForm
        id="new-comment"
        title="Add a comment"
        submitLabel="Add comment"
        initial={EMPTY}
        send={(values) => postJson<AdminTestimonial>(URL, values)}
        onDone={(made) => setComments((list) => [...(list ?? []), made])}
      />
      <section aria-labelledby="all-comments" className="space-y-4">
        <h2 id="all-comments" className="text-xl font-semibold">
          Comments
        </h2>
        {problem && (
          <p role="alert" className="text-danger">
            {problem}
          </p>
        )}
        <LoadState error={error} loading={comments === null} empty={comments?.length === 0} emptyText="No comments yet." />
        {comments && comments.length > 0 && (
          <ul className="grid gap-4">
            {comments.map((comment, index) => (
              <li key={comment.id}>
                <CommentCard
                  comment={comment}
                  index={index}
                  count={comments.length}
                  onMove={(delta) => move(index, delta)}
                  onSaved={replace}
                  onDeleted={() => setComments((list) => list?.filter((row) => row.id !== comment.id) ?? null)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type FormProps = {
  id: string;
  title: string;
  submitLabel: string;
  initial: Values;
  send: (values: Values) => Promise<AdminTestimonial>;
  onDone: (comment: AdminTestimonial) => void;
  onCancel?: () => void;
};

function CommentForm({ id, title, submitLabel, initial, send, onDone, onCancel }: FormProps) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (name: keyof Values, value: string | boolean) => setValues((current) => ({ ...current, [name]: value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!values.quote.trim()) found.quote = "Write what they said.";
    if (!values.person_name.trim()) found.person_name = "Fill this in.";
    if (values.visible && !values.permission) found.permission = "Tick that they agreed, or leave it hidden for now.";
    if (Object.keys(found).length > 0) {
      setError(CHECK_FORM);
      setErrors(found);
      setAttempt((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      onDone(await send(values));
      setValues(initial);
      setErrors({});
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  const text = (name: keyof Values, label: string, required = false, hint?: string) => (
    <Field id={`${id}-${name}`} label={label} hint={hint} required={required} error={errors[name]}>
      {(props) => (
        <input
          {...props}
          value={String(values[name])}
          onChange={(event) => set(name, event.target.value)}
          className={inputClasses}
        />
      )}
    </Field>
  );

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby={`${id}-title`}
      className="surface max-w-xl space-y-5 rounded-card p-5 shadow-elev-1"
    >
      <h2 id={`${id}-title`} className="text-xl font-semibold">
        {title}
      </h2>
      <FormAlert message={error} focusKey={attempt} />
      <Field id={`${id}-quote`} label="What they said" required error={errors.quote}>
        {(props) => (
          <textarea
            {...props}
            value={values.quote}
            maxLength={600}
            onChange={(event) => set("quote", event.target.value)}
            className={textareaClasses}
          />
        )}
      </Field>
      {text("person_name", "Name", true)}
      {text("person_role", "Role")}
      {text("school_name", "School")}
      {text(
        "school_slug",
        "Their school's address on the platform",
        false,
        "For example hope-academy. The comment then links to the school's website while it is live.",
      )}
      <div>
        <Tick label={PERMISSION_LABEL} checked={values.permission} onChange={(value) => set("permission", value)} />
        {errors.permission && <p className="text-sm text-danger">{errors.permission}</p>}
        <Tick label="Show on the website" checked={values.visible} onChange={(value) => set("visible", value)} />
      </div>
      <div className="flex gap-3">
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

type CardProps = {
  comment: AdminTestimonial;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onSaved: (comment: AdminTestimonial) => void;
  onDeleted: () => void;
};

function CommentCard({ comment, index, count, onMove, onSaved, onDeleted }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const titleId = `comment-${comment.id}-name`;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (caught) {
      setProblem(firstProblem(caught));
      setAttempt((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  function uploadPhoto() {
    if (!file) return;
    const form = new FormData();
    form.append("image", file);
    run(async () => onSaved(await postForm<AdminTestimonial>(`${URL}/${comment.id}/photo`, form)));
  }

  if (editing) {
    return (
      <CommentForm
        id={`comment-${comment.id}`}
        title={`Edit ${comment.person_name}'s comment`}
        submitLabel="Save"
        initial={{
          quote: comment.quote,
          person_name: comment.person_name,
          person_role: comment.person_role,
          school_name: comment.school_name,
          school_slug: comment.school_slug,
          permission: comment.permission,
          visible: comment.visible,
        }}
        send={(values) => patchJson<AdminTestimonial>(`${URL}/${comment.id}`, values)}
        onDone={(saved) => {
          onSaved(saved);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article aria-labelledby={titleId} className="surface space-y-3 rounded-card p-4 shadow-elev-1">
      <div className="flex flex-wrap items-center gap-4">
        {comment.photo && (
          <ResponsiveImage image={comment.photo} sizes="64px" className="size-16 rounded-full object-cover" />
        )}
        <div>
          <h3 id={titleId} className="font-semibold">
            {comment.person_name}
          </h3>
          <p className="text-sm text-ink-muted">{[comment.person_role, comment.school_name].filter(Boolean).join(", ")}</p>
        </div>
      </div>
      <blockquote className="border-l-4 border-indigo/40 pl-4">{comment.quote}</blockquote>
      <p className="text-sm text-ink-muted">
        <span>{comment.visible && comment.permission ? "On your website" : "Hidden"}</span>
      </p>
      <FormAlert message={problem} focusKey={attempt} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () => onSaved(await patchJson<AdminTestimonial>(`${URL}/${comment.id}`, { visible: !comment.visible })))
          }
        >
          {comment.visible ? "Hide" : "Show"}
        </Button>
        <OrderButtons label={comment.person_name} index={index} count={count} disabled={busy} onMove={onMove} />
        <ConfirmDelete
          busy={busy}
          onConfirm={() =>
            run(async () => {
              await deleteJson(`${URL}/${comment.id}`);
              onDeleted();
            })
          }
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field id={`comment-${comment.id}-photo`} label={`Photo of ${comment.person_name}`}>
          {(props) => (
            <input
              {...props}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className={inputClasses}
            />
          )}
        </Field>
        <Button variant="outline" disabled={busy || !file} onClick={uploadPhoto}>
          Upload photo
        </Button>
        {comment.photo && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(async () => onSaved(await deleteJson<AdminTestimonial>(`${URL}/${comment.id}/photo`)))}
          >
            Remove photo
          </Button>
        )}
      </div>
    </article>
  );
}
