"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { RichText } from "@/components/ui/rich-text";
import { deleteJson, errorMessage, fieldErrors, patchJson, postForm, postJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import type { AdminArticle, ArticleKind } from "@/lib/types";
import { KIND_LABEL, stateText } from "./article-state";
import { ConfirmDelete, LoadState, Tick, WEBSITE_API, textareaClasses, useLoad } from "./shared";
import { TextToolbar, insertAt } from "./text-toolbar";

type Text = { kind: ArticleKind; title: string; summary: string; body: string; author_name: string };

const textOf = ({ kind, title, summary, body, author_name }: AdminArticle): Text => ({
  kind,
  title,
  summary,
  body,
  author_name,
});

/** Writing, publishing and scheduling one article (business tools spec §5.3). */
export function ArticleEditor({ id }: { id: number }) {
  const { data: article, setData, error } = useLoad<AdminArticle>(`${WEBSITE_API}/articles/${id}`);
  return (
    <div className="space-y-6">
      <Link href="/website/articles" className="link text-sm">
        All articles
      </Link>
      <LoadState error={error} loading={article === null} empty={false} emptyText="" />
      {article && <Editor article={article} onSaved={setData} />}
    </div>
  );
}

function Editor({ article, onSaved }: { article: AdminArticle; onSaved: (article: AdminArticle) => void }) {
  const url = `${WEBSITE_API}/articles/${article.id}`;
  const router = useRouter();
  const [text, setText] = useState<Text>(textOf(article));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [emailSubscribers, setEmailSubscribers] = useState(false);
  const [when, setWhen] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const saved = textOf(article);
  const changed = (Object.keys(text) as (keyof Text)[]).some((key) => text[key] !== saved[key]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setAlert(null);
    setNotice(null);
    try {
      await action();
      setErrors({});
    } catch (caught) {
      setAlert(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  async function saveText() {
    const row = await patchJson<AdminArticle>(url, text);
    onSaved(row);
    return row;
  }

  const save = () =>
    run(async () => {
      await saveText();
      setNotice("Saved.");
    });

  const publish = (publishAt: string | null) =>
    run(async () => {
      if (changed) await saveText();
      const row = await postJson<AdminArticle>(`${url}/publish`, { publish_at: publishAt, email_subscribers: emailSubscribers });
      onSaved(row);
      setNotice(
        row.state === "scheduled" && row.publish_at
          ? `It will go live on ${formatDateTime(row.publish_at)}.`
          : "It's live on your website.",
      );
    });

  function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!when) {
      setErrors({ publish_at: "Choose when it should go live." });
      return;
    }
    publish(new Date(when).toISOString());
  }

  const unpublish = () =>
    run(async () => {
      onSaved(await postJson<AdminArticle>(`${url}/unpublish`));
      setNotice("Taken off your website. It's a draft again.");
    });

  const remove = () =>
    run(async () => {
      await deleteJson(url);
      router.push("/website/articles");
    });

  const field = (name: keyof Text) => (value: string) => setText((current) => ({ ...current, [name]: value }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">{article.title}</h1>
        <p className="mt-1 text-ink-muted">
          Status: <span>{stateText(article)}</span>
        </p>
      </div>
      <FormAlert message={alert} focusKey={attempt} />
      {notice && (
        <p role="status" className="rounded-control bg-success/10 p-4">
          {notice}
        </p>
      )}

      <section aria-labelledby="article-text" className="space-y-5">
        <h2 id="article-text" className="text-xl font-semibold">
          Text
        </h2>
        <Field id="article-title" label="Title" required error={errors.title}>
          {(props) => (
            <input {...props} value={text.title} onChange={(event) => field("title")(event.target.value)} className={inputClasses} />
          )}
        </Field>
        <Field id="article-kind" label="Kind" required error={errors.kind}>
          {(props) => (
            <select
              {...props}
              value={text.kind}
              onChange={(event) => field("kind")(event.target.value)}
              className={inputClasses}
            >
              <option value="tip">{KIND_LABEL.tip}</option>
              <option value="news">{KIND_LABEL.news}</option>
            </select>
          )}
        </Field>
        <Field
          id="article-summary"
          label="Summary"
          hint={`Shown in lists and when the article is shared. ${text.summary.length}/240 characters.`}
          required
          error={errors.summary}
        >
          {(props) => (
            <textarea
              {...props}
              value={text.summary}
              maxLength={240}
              onChange={(event) => field("summary")(event.target.value)}
              className={textareaClasses}
            />
          )}
        </Field>
        <Field id="article-author" label="Author" error={errors.author_name}>
          {(props) => (
            <input
              {...props}
              value={text.author_name}
              onChange={(event) => field("author_name")(event.target.value)}
              className={inputClasses}
            />
          )}
        </Field>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TextToolbar target={bodyRef} onChange={field("body")} />
            <Button variant="outline" aria-pressed={preview} onClick={() => setPreview((shown) => !shown)}>
              {preview ? "Edit text" : "Preview"}
            </Button>
          </div>
          {preview ? (
            <div className="surface rounded-card p-5">
              <RichText text={text.body} />
            </div>
          ) : (
            <Field
              id="article-body"
              label="Article text"
              hint="Leave a blank line between paragraphs. Use the buttons above for headings, lists, bold, links and quotes."
              required
              error={errors.body}
            >
              {(props) => (
                <textarea
                  {...props}
                  ref={bodyRef}
                  value={text.body}
                  onChange={(event) => field("body")(event.target.value)}
                  className={`${textareaClasses} min-h-80 font-mono text-sm`}
                />
              )}
            </Field>
          )}
          <InsertPhoto
            onInserted={(markdown) => {
              const area = bodyRef.current;
              const at = area ? area.selectionEnd : text.body.length;
              field("body")(insertAt(text.body, at, at, { before: markdown, block: true }).text);
            }}
          />
        </div>
        <Button disabled={busy || !changed} onClick={save}>
          Save
        </Button>
      </section>

      <Cover article={article} url={url} error={errors.cover_alt} onSaved={onSaved} />

      <section aria-labelledby="article-publish" className="surface space-y-4 rounded-card p-5 shadow-elev-1">
        <h2 id="article-publish" className="text-xl font-semibold">
          Publish
        </h2>
        <Tick
          label="Email tip subscribers when it goes live"
          checked={emailSubscribers}
          onChange={setEmailSubscribers}
        />
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => publish(null)}>
            Publish now
          </Button>
          {article.status === "published" && (
            <Button variant="outline" disabled={busy} onClick={unpublish}>
              Unpublish
            </Button>
          )}
        </div>
        <form noValidate onSubmit={schedule} className="flex flex-wrap items-end gap-3">
          <Field id="article-when" label="Or go live at" error={errors.publish_at}>
            {(props) => (
              <input
                {...props}
                type="datetime-local"
                value={when}
                onChange={(event) => setWhen(event.target.value)}
                className={inputClasses}
              />
            )}
          </Field>
          <Button type="submit" variant="outline" disabled={busy}>
            Schedule
          </Button>
        </form>
        {article.status === "draft" && <ConfirmDelete label="Delete draft" busy={busy} onConfirm={remove} />}
      </section>
    </div>
  );
}

function InsertPhoto({ onInserted }: { onInserted: (markdown: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !alt.trim()) {
      setError("Choose a photo and describe it for blind visitors.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("alt_text", alt);
      const { markdown } = await postForm<{ markdown: string }>(`${WEBSITE_API}/article-images`, form);
      onInserted(markdown);
      setFile(null);
      setAlt("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-control border border-line p-4">
      <summary className="min-h-11 cursor-pointer content-center font-semibold">Insert a photo</summary>
      <form noValidate onSubmit={onSubmit} className="mt-3 space-y-4">
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <Field id="insert-photo-file" label="Photo" required>
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
        <Field id="insert-photo-alt" label="Photo description" hint="What the photo shows, for blind visitors." required>
          {(props) => <input {...props} value={alt} onChange={(event) => setAlt(event.target.value)} className={inputClasses} />}
        </Field>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Uploading…" : "Insert photo"}
        </Button>
      </form>
    </details>
  );
}

type CoverProps = { article: AdminArticle; url: string; error?: string; onSaved: (article: AdminArticle) => void };

function Cover({ article, url, error, onSaved }: CoverProps) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState(article.cover_alt);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<AdminArticle>) {
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await action());
    } catch (caught) {
      setProblem(Object.values(fieldErrors(caught))[0] ?? errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !alt.trim()) {
      setProblem("Choose a photo and describe it for blind visitors.");
      return;
    }
    const form = new FormData();
    form.append("image", file);
    form.append("cover_alt", alt);
    run(() => postForm<AdminArticle>(`${url}/cover`, form));
  }

  return (
    <section aria-labelledby="article-cover" className="space-y-4">
      <h2 id="article-cover" className="text-xl font-semibold">
        Cover photo
      </h2>
      {(problem ?? error) && (
        <p role="alert" className="text-danger">
          {problem ?? error}
        </p>
      )}
      {article.cover && (
        <div className="flex flex-wrap items-end gap-4">
          <ResponsiveImage image={article.cover} sizes="240px" className="h-32 w-auto rounded-control" />
          <Button variant="outline" disabled={busy} onClick={() => run(() => deleteJson<AdminArticle>(`${url}/cover`))}>
            Remove cover photo
          </Button>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="max-w-xl space-y-4">
        <Field id="cover-file" label={article.cover ? "New cover photo" : "Cover photo"}>
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
        <Field id="cover-alt" label="Cover photo description" hint="What the photo shows, for blind visitors.">
          {(props) => <input {...props} value={alt} onChange={(event) => setAlt(event.target.value)} className={inputClasses} />}
        </Field>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Uploading…" : "Upload cover photo"}
        </Button>
      </form>
    </section>
  );
}
