"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { errorMessage, fieldErrors, postJson } from "@/lib/client-api";
import type { AdminArticle, ArticleKind } from "@/lib/types";
import { KIND_LABEL, stateText } from "./article-state";
import { CHECK_FORM, LoadState, WEBSITE_API, useLoad } from "./shared";

const URL = `${WEBSITE_API}/articles`;

/** Articles and tips on your website (business tools spec §5.3). */
export function ArticlesView() {
  const { data: articles, error } = useLoad<AdminArticle[]>(URL);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Articles and tips</h1>
        <p className="mt-1 text-ink-muted">
          News about your service, and tips that help schools run and grow. Drafts stay private until you publish them.
        </p>
      </div>
      <NewArticle />
      <section aria-labelledby="all-articles" className="space-y-4">
        <h2 id="all-articles" className="text-xl font-semibold">
          All articles
        </h2>
        <LoadState error={error} loading={articles === null} empty={articles?.length === 0} emptyText="No articles yet." />
        {articles && articles.length > 0 && (
          <ul className="grid gap-3">
            {articles.map((article) => (
              <li key={article.id} className="surface rounded-card p-4 shadow-elev-1">
                <Link href={`/website/articles/${article.id}`} className="link text-lg font-semibold">
                  {article.title}
                </Link>
                <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-muted">
                  <span>{KIND_LABEL[article.kind]}</span>
                  <span>{stateText(article)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewArticle() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ArticleKind>("tip");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError(CHECK_FORM);
      setErrors({ title: "Give it a title." });
      setAttempt((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      const made = await postJson<AdminArticle>(URL, { kind, title });
      router.push(`/website/articles/${made.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="new-article-title"
      className="surface max-w-xl space-y-5 rounded-card p-5 shadow-elev-1"
    >
      <h2 id="new-article-title" className="text-xl font-semibold">
        Start a new article
      </h2>
      <FormAlert message={error} focusKey={attempt} />
      <Field id="new-article-title-field" label="Title" required error={errors.title}>
        {(props) => (
          <input {...props} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClasses} />
        )}
      </Field>
      <Field id="new-article-kind" label="Kind" required error={errors.kind}>
        {(props) => (
          <select
            {...props}
            value={kind}
            onChange={(event) => setKind(event.target.value as ArticleKind)}
            className={inputClasses}
          >
            <option value="tip">{KIND_LABEL.tip}</option>
            <option value="news">{KIND_LABEL.news}</option>
          </select>
        )}
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Starting…" : "Start writing"}
      </Button>
    </form>
  );
}
