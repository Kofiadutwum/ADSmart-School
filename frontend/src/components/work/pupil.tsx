"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LoadState, useAction, useLoad } from "@/components/portal/kit";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client-api";
import { PageHead, Stat, Table } from "./common";
import { ReportCardView, ResourceCard, type ReportCard } from "./learning";

const API = "/api/student";

export function MyResultsScreen() {
  const terms = useLoad<{ id: number; name: string }[]>(`${API}/terms`);
  const attendance = useLoad<{ days: number; present: number; late: number; absent: number; rate: number | null }>(`${API}/attendance`);
  const [term, setTerm] = useState("");
  const chosen = term || String(terms.data?.[0]?.id ?? "");
  return (
    <div className="space-y-6">
      <PageHead title="Results" />
      {attendance.data && attendance.data.days > 0 && (
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Days present" value={attendance.data.present + attendance.data.late} note={`of ${attendance.data.days}`} />
          <Stat label="Attendance" value={attendance.data.rate === null ? "—" : `${attendance.data.rate}%`} />
        </dl>
      )}
      <LoadState error={terms.error} loading={!terms.data && !terms.error} empty={(terms.data ?? []).length === 0} emptyText="No terms yet." />
      {terms.data && terms.data.length > 0 && (
        <label className="block max-w-xs font-medium">
          Term
          <select value={chosen} onChange={(e) => setTerm(e.target.value)} className={`${inputClasses} mt-2`}>
            {terms.data.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {chosen && <MyReport key={chosen} term={chosen} />}
    </div>
  );
}

function MyReport({ term }: { term: string }) {
  const { data, error } = useLoad<ReportCard>(`${API}/report-card?term=${term}`);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return <ReportCardView card={data} />;
}

type QuizRow = { id: number; title: string; subject: string; status: string; done: boolean; score: string | null; out_of: number };

export function MyQuizzesScreen() {
  const { data, error } = useLoad<QuizRow[]>(`${API}/quizzes`);
  const rows = data ?? [];
  return (
    <div>
      <PageHead title="Quizzes" intro="Each quiz can be answered once. You see your mark straight away." />
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No quizzes for your class yet." />
      <ul className="grid gap-4 lg:grid-cols-2">
        {rows.map((quiz) => (
          <li key={quiz.id}>
            <Link href={`/my-quizzes/take?id=${quiz.id}`} className="block h-full rounded-card border border-line bg-card p-5 hover:bg-ink/5">
              <span className="font-semibold">{quiz.title}</span>
              <span className="block text-sm text-ink-muted">
                {quiz.subject} · {quiz.done ? `Your mark: ${quiz.score} out of ${quiz.out_of}` : quiz.status === "CLOSED" ? "Closed" : "Not done yet"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type TakeQuiz = {
  title: string;
  done: boolean;
  score?: string;
  questions: { id: number; kind: string; text: string; options: string[]; marks: number; your_answer?: string; correct?: boolean; answer?: string }[];
};

export function TakeQuizScreen() {
  const id = Number(useSearchParams().get("id")) || 0;
  const { data, error, reload } = useLoad<TakeQuiz>(`${API}/quizzes/${id}`);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const { act, busy, alert } = useAction();
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  if (data.done) {
    return (
      <div className="space-y-4">
        <PageHead title={data.title} intro={`Your mark: ${data.score}`} />
        <ol className="list-inside list-decimal space-y-3">
          {data.questions.map((q) => (
            <li key={q.id} className="rounded-card border border-line bg-card p-4">
              <span className="font-semibold">{q.text}</span>
              <span className="block">
                Your answer: {q.your_answer || "—"} {q.correct ? "✓ right" : `✗ the answer was ${q.answer}`}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHead title={data.title} intro="Answer every question, then hand it in. You can only hand it in once." />
      <ol className="list-inside list-decimal space-y-4">
        {data.questions.map((q) => (
          <li key={q.id} className="rounded-card border border-line bg-card p-4">
            <fieldset>
              <legend className="font-semibold">
                {q.text} <span className="text-sm font-normal text-ink-muted">({q.marks} mark{q.marks === 1 ? "" : "s"})</span>
              </legend>
              {q.kind === "CHOICE" ? (
                <div className="mt-2 space-y-1">
                  {q.options.map((option) => (
                    <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={answers[q.id] === option}
                        onChange={() => setAnswers({ ...answers, [q.id]: option })}
                        className="size-5 accent-indigo"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  aria-label={`Answer to: ${q.text}`}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  className={`${inputClasses} mt-2`}
                />
              )}
            </fieldset>
          </li>
        ))}
      </ol>
      <Button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            await postJson(`${API}/quizzes/${id}`, { answers });
            reload();
          })
        }
      >
        Hand in
      </Button>
      {alert}
    </div>
  );
}

export function MyTimetableScreen() {
  const { data, error } = useLoad<{ day: number; period: string; start: string; subject: string; teacher: string }[]>(`${API}/timetable`);
  const rows = data ?? [];
  return (
    <div>
      <PageHead title="Timetable" />
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="The timetable isn't ready yet." />
      {rows.length > 0 && (
        <Table
          caption="Timetable"
          head={["Day", "Period", "Subject", "Teacher"]}
          rows={rows.map((s) => [["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][s.day - 1] ?? s.day, s.period, s.subject, s.teacher])}
        />
      )}
    </div>
  );
}

export function MyResourcesScreen() {
  const { data, error } = useLoad<Parameters<typeof ResourceCard>[0]["item"][]>(`${API}/resources`);
  const rows = data ?? [];
  return (
    <div>
      <PageHead title="Resources" intro="Notes and links your teachers have shared." />
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="Nothing shared yet." />
      <ul className="grid gap-4 lg:grid-cols-2">
        {rows.map((item) => (
          <li key={item.id}>
            <ResourceCard item={item} filePath={`${API}/resources/${item.id}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

