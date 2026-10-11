"use client";

import { useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, errorMessage, fieldErrors, patchJson, postJson } from "@/lib/client-api";
import type { AdminFaq } from "@/lib/types";
import {
  CHECK_FORM,
  ConfirmDelete,
  LoadState,
  OrderButtons,
  WEBSITE_API,
  firstProblem,
  moved,
  textareaClasses,
  useLoad,
} from "./shared";

const URL = `${WEBSITE_API}/faqs`;
type Values = { question: string; answer: string };

/** Questions and answers on your website (business tools spec §5.5). */
export function FaqsManager() {
  const { data: items, setData: setItems, error } = useLoad<AdminFaq[]>(URL);
  const [problem, setProblem] = useState<string | null>(null);

  async function move(index: number, delta: -1 | 1) {
    if (!items) return;
    try {
      setItems(await postJson<AdminFaq[]>(`${URL}/order`, { ids: moved(items, index, delta).map((item) => item.id) }));
    } catch (caught) {
      setProblem(errorMessage(caught));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Questions</h1>
        <p className="mt-1 text-ink-muted">Questions schools often ask, answered on your home page.</p>
      </div>
      <FaqForm
        id="new-faq"
        title="Add a question"
        submitLabel="Add question"
        initial={{ question: "", answer: "" }}
        send={(values) => postJson<AdminFaq>(URL, values)}
        onDone={(made) => setItems((list) => [...(list ?? []), made])}
      />
      <section aria-labelledby="all-faqs" className="space-y-4">
        <h2 id="all-faqs" className="text-xl font-semibold">
          All questions
        </h2>
        {problem && (
          <p role="alert" className="text-danger">
            {problem}
          </p>
        )}
        <LoadState error={error} loading={items === null} empty={items?.length === 0} emptyText="No questions yet." />
        {items && items.length > 0 && (
          <ul className="grid gap-4">
            {items.map((item, index) => (
              <li key={item.id}>
                <FaqCard
                  item={item}
                  index={index}
                  count={items.length}
                  onMove={(delta) => move(index, delta)}
                  onSaved={(saved) => setItems((list) => list?.map((row) => (row.id === saved.id ? saved : row)) ?? null)}
                  onDeleted={() => setItems((list) => list?.filter((row) => row.id !== item.id) ?? null)}
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
  title?: string;
  submitLabel: string;
  initial: Values;
  send: (values: Values) => Promise<AdminFaq>;
  onDone: (item: AdminFaq) => void;
  onCancel?: () => void;
};

function FaqForm({ id, title, submitLabel, initial, send, onDone, onCancel }: FormProps) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!values.question.trim()) found.question = "Fill this in.";
    if (!values.answer.trim()) found.answer = "Fill this in.";
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

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby={title ? `${id}-title` : undefined}
      className="max-w-xl space-y-5"
    >
      {title && (
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {title}
        </h2>
      )}
      <FormAlert message={error} focusKey={attempt} />
      <Field id={`${id}-question`} label="Question" required error={errors.question}>
        {(props) => (
          <input
            {...props}
            value={values.question}
            onChange={(event) => setValues((current) => ({ ...current, question: event.target.value }))}
            className={inputClasses}
          />
        )}
      </Field>
      <Field id={`${id}-answer`} label="Answer" required error={errors.answer}>
        {(props) => (
          <textarea
            {...props}
            value={values.answer}
            onChange={(event) => setValues((current) => ({ ...current, answer: event.target.value }))}
            className={textareaClasses}
          />
        )}
      </Field>
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
  item: AdminFaq;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onSaved: (item: AdminFaq) => void;
  onDeleted: () => void;
};

function FaqCard({ item, index, count, onMove, onSaved, onDeleted }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const titleId = `faq-${item.id}-question`;

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

  return (
    <article aria-labelledby={titleId} className="surface space-y-3 rounded-card p-4 shadow-elev-1">
      <h3 id={titleId} className="font-semibold">
        {item.question}
      </h3>
      {editing ? (
        <FaqForm
          id={`faq-${item.id}`}
          submitLabel="Save"
          initial={{ question: item.question, answer: item.answer }}
          send={(values) => patchJson<AdminFaq>(`${URL}/${item.id}`, values)}
          onDone={(saved) => {
            onSaved(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="whitespace-pre-line">{item.answer}</p>
      )}
      <p className="text-sm text-ink-muted">
        <span>{item.visible ? "On your website" : "Hidden"}</span>
      </p>
      <FormAlert message={problem} focusKey={attempt} />
      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(async () => onSaved(await patchJson<AdminFaq>(`${URL}/${item.id}`, { visible: !item.visible })))}
          >
            {item.visible ? "Hide" : "Show"}
          </Button>
          <OrderButtons label={item.question} index={index} count={count} disabled={busy} onMove={onMove} />
          <ConfirmDelete
            busy={busy}
            onConfirm={() =>
              run(async () => {
                await deleteJson(`${URL}/${item.id}`);
                onDeleted();
              })
            }
          />
        </div>
      )}
    </article>
  );
}
