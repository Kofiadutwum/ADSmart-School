"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { InputField, LoadState, textareaClasses, useAction, useLoad, useSubmit } from "@/components/portal/kit";
import { RecordForm, RecordsView, type Row } from "@/components/portal/records-view";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { patchJson, postForm, postJson, putJson } from "@/lib/client-api";
import { ADMINISTRATOR, CAREGIVER, FRONT_DESK, HEAD_TEACHER, TEACHER } from "@/lib/school-roles";
import { ActButton, DatePick, Panel, Picker, Section, Table, today, useRoleIs, when, words } from "./common";

const API = "/api/school/learning";
const LEADERS = [ADMINISTRATOR, HEAD_TEACHER];

// ---- Attendance ----------------------------------------------------------------------------

type Register = {
  class: string;
  date: string;
  open_day: boolean;
  pupils: { student: number; name: string; status: string; note: string }[];
};
const MARKS = [
  ["PRESENT", "Present"],
  ["LATE", "Late"],
  ["ABSENT", "Absent"],
  ["EXCUSED", "Excused"],
] as const;

export function RegisterScreen() {
  const [klass, setKlass] = useState("");
  const [date, setDate] = useState(today());
  const staffDesk = useRoleIs(FRONT_DESK, ...LEADERS);
  const classTaker = useRoleIs(TEACHER, CAREGIVER, ...LEADERS);
  return (
    <Section title="Attendance" intro="The register is taken on open school days. Families are texted when their child is marked absent today.">
      {classTaker && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Picker id="register-class" label="Class" source="classes" value={klass} onChange={setKlass} />
            <DatePick id="register-date" label="Day" value={date} onChange={setDate} />
          </div>
          {klass && <ClassRegister key={`${klass}-${date}`} klass={klass} date={date} />}
        </>
      )}
      {staffDesk && (
        <div className="mt-10">
          <StaffRegister />
        </div>
      )}
    </Section>
  );
}

function ClassRegister({ klass, date }: { klass: string; date: string }) {
  const { data, error } = useLoad<Register>(`${API}/register/${klass}?date=${date}`);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const { act, busy, alert } = useAction();
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  if (!data.open_day) return <p>The school is closed on this day.</p>;
  const value = (pupil: Register["pupils"][number]) => marks[pupil.student] ?? (pupil.status || "PRESENT");
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {data.pupils.map((pupil) => (
          <li key={pupil.student} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card p-3">
            <span className="font-semibold">{pupil.name}</span>
            <fieldset className="flex flex-wrap gap-1">
              <legend className="sr-only">Mark for {pupil.name}</legend>
              {MARKS.map(([code, label]) => (
                <label
                  key={code}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-control border px-3 text-sm font-semibold ${
                    value(pupil) === code ? "border-ink bg-ink/10" : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name={`mark-${pupil.student}`}
                    value={code}
                    checked={value(pupil) === code}
                    onChange={() => setMarks({ ...marks, [pupil.student]: code })}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ul>
      <Button
        disabled={busy || data.pupils.length === 0}
        onClick={() =>
          void act(async () => {
            const body = await postJson<{ saved: number; texts: number }>(`${API}/register/${klass}`, {
              date,
              marks: data.pupils.map((pupil) => ({ student: pupil.student, status: value(pupil) })),
            });
            setSaved(`Saved ${body.saved} marks.${body.texts ? ` ${body.texts} families texted about an absence.` : ""}`);
          })
        }
      >
        Save register
      </Button>
      {alert}
      {saved && <p role="status">{saved}</p>}
    </div>
  );
}

function StaffRegister() {
  const [date, setDate] = useState(today());
  const { data, error } = useLoad<{ staff: number; name: string; status: string }[]>(`${API}/staff-register?date=${date}`);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const { act, busy, alert } = useAction();
  const [saved, setSaved] = useState(false);
  return (
    <Panel title="Staff attendance">
      <DatePick id="staff-date" label="Day" value={date} onChange={setDate} />
      <LoadState error={error} loading={!data && !error} empty={(data ?? []).length === 0} emptyText="No staff yet." />
      <ul className="space-y-2">
        {(data ?? []).map((member) => (
          <li key={member.staff} className="flex flex-wrap items-center justify-between gap-3">
            <span>{member.name}</span>
            <select
              aria-label={`Attendance for ${member.name}`}
              value={marks[member.staff] ?? (member.status || "PRESENT")}
              onChange={(e) => setMarks({ ...marks, [member.staff]: e.target.value })}
              className={`${inputClasses} min-h-11 w-48 py-2`}
            >
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
              <option value="ON_LEAVE">On leave</option>
            </select>
          </li>
        ))}
      </ul>
      <Button
        disabled={busy || !data?.length}
        onClick={() =>
          void act(async () => {
            await postJson(`${API}/staff-register`, {
              date,
              marks: (data ?? []).map((m) => ({ staff: m.staff, status: marks[m.staff] ?? (m.status || "PRESENT") })),
            });
            setSaved(true);
          })
        }
      >
        Save staff attendance
      </Button>
      {alert}
      {saved && <p role="status">Saved.</p>}
    </Panel>
  );
}

export function LeaveScreen() {
  const decider = useRoleIs(...LEADERS);
  return (
    <Section title="Leave" intro="Ask for leave here. The Head Teacher decides.">
      <RecordsView
        path={`${API}/leave`}
        noun="leave request"
        title={(row) => `${String(row.staff_label || "My request")}: ${words(row.kind)}`}
        fields={[
          { name: "kind", label: "Kind", type: "choice", required: true, choices: [["ANNUAL", "Annual leave"], ["SICK", "Sick leave"], ["MATERNITY", "Maternity or paternity"], ["OTHER", "Other"]] },
          { name: "start", label: "First day", type: "date", required: true },
          { name: "end", label: "Last day", type: "date", required: true },
          { name: "reason", label: "Reason" },
          { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["PENDING", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]] },
        ]}
        canAdd
        actions={(row, replace) =>
          decider && row.status === "PENDING" ? (
            <>
              <ActButton label="Approve" path={`${API}/leave/${row.id}/decide`} body={{ approve: true }} onDone={(r) => replace(r as Row)} />
              <ActButton label="Turn down" path={`${API}/leave/${row.id}/decide`} body={{ approve: false }} onDone={(r) => replace(r as Row)} />
            </>
          ) : null
        }
      />
    </Section>
  );
}

// ---- Marks and results ---------------------------------------------------------------------

type MarkSheet = {
  sheet: { id: number; status: string; class: string; subject: string; term: string };
  style: string;
  components: { id: number; name: string; weight: number; max_score: number }[];
  pupils: { student: number; name: string; marks: Record<string, string | null>; descriptive: { level: string; comment: string } | null }[];
};

export function MarksScreen() {
  const [klass, setKlass] = useState("");
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState("");
  return (
    <Section title="Marks" intro="Enter marks for the subjects you teach. Once submitted they go to the Head Teacher.">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Picker id="marks-class" label="Class" source="classes" value={klass} onChange={setKlass} />
        <Picker id="marks-subject" label="Subject" source="subjects" value={subject} onChange={setSubject} />
        <Picker id="marks-term" label="Term" source="terms" value={term} onChange={setTerm} />
      </div>
      {klass && subject && term ? (
        <MarkGrid key={`${klass}-${subject}-${term}`} klass={klass} subject={subject} term={term} />
      ) : (
        <p className="text-ink-muted">Choose the class, subject and term.</p>
      )}
    </Section>
  );
}

function MarkGrid({ klass, subject, term }: { klass: string; subject: string; term: string }) {
  const { data, error, setData } = useLoad<MarkSheet>(`${API}/marks?class=${klass}&subject=${subject}&term=${term}`);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  const { act, busy, alert } = useAction();
  const head = useRoleIs(HEAD_TEACHER);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  const locked = data.sheet.status !== "DRAFT";
  const key = (student: number, component: number) => `${student}:${component}`;
  const value = (student: number, component: number) =>
    values[key(student, component)] ?? data.pupils.find((p) => p.student === student)?.marks[String(component)] ?? "";

  if (data.style === "DESCRIPTIVE") return <DescriptiveGrid data={data} klass={klass} subject={subject} term={term} />;
  if (data.components.length === 0) {
    return <p>The parts of the assessment for this level aren&apos;t set up yet. Ask the Head Teacher (School setup → Assessment).</p>;
  }
  return (
    <div className="space-y-4">
      <p>
        {data.sheet.class} · {data.sheet.subject} · {data.sheet.term} · <strong>{words(data.sheet.status)}</strong>
      </p>
      <Table
        caption="Marks"
        head={["Pupil", ...data.components.map((c) => `${c.name} (out of ${c.max_score})`)]}
        rows={data.pupils.map((pupil) => [
          pupil.name,
          ...data.components.map((component) => (
            <input
              key={component.id}
              aria-label={`${component.name} for ${pupil.name}`}
              inputMode="decimal"
              disabled={locked && !head}
              value={value(pupil.student, component.id) ?? ""}
              onChange={(e) => setValues({ ...values, [key(pupil.student, component.id)]: e.target.value })}
              className={`${inputClasses} min-h-11 w-24 py-2`}
            />
          )),
        ])}
      />
      {locked && head && <InputField id="marks-reason" label="Why the approved marks are changing" value={reason} onChange={setReason} />}
      <div className="flex flex-wrap gap-3">
        {(!locked || head) && (
          <Button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const marks = Object.entries(values)
                  .filter(([, score]) => score.trim() !== "")
                  .map(([joined, score]) => {
                    const [student, component] = joined.split(":").map(Number);
                    return { student, component, score: score.trim() };
                  });
                await postJson(`${API}/marks`, { school_class: Number(klass), subject: Number(subject), term: Number(term), marks, reason });
                setSaved(true);
              })
            }
          >
            Save marks
          </Button>
        )}
        {!locked && (
          <ActButton
            label="Submit to the Head Teacher"
            confirm="Submit? You can't change the marks after this unless they're returned."
            path={`${API}/sheets/${data.sheet.id}/submit`}
            onDone={(r) => setData({ ...data, sheet: { ...data.sheet, status: (r as { status: string }).status } })}
          />
        )}
      </div>
      {alert}
      {saved && <p role="status">Marks saved.</p>}
    </div>
  );
}

const LEVELS = [
  ["EMERGING", "Emerging"],
  ["DEVELOPING", "Developing"],
  ["SECURE", "Secure"],
  ["EXCEEDING", "Exceeding"],
] as const;

function DescriptiveGrid({ data, klass, subject, term }: { data: MarkSheet; klass: string; subject: string; term: string }) {
  const [rows, setRows] = useState(() =>
    Object.fromEntries(data.pupils.map((p) => [p.student, p.descriptive ?? { level: "", comment: "" }])),
  );
  const { act, busy, alert } = useAction();
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-3">
      {data.pupils.map((pupil) => (
        <div key={pupil.student} className="grid gap-3 rounded-card border border-line bg-card p-3 sm:grid-cols-3">
          <span className="font-semibold">{pupil.name}</span>
          <select
            aria-label={`Level for ${pupil.name}`}
            value={rows[pupil.student].level}
            onChange={(e) => setRows({ ...rows, [pupil.student]: { ...rows[pupil.student], level: e.target.value } })}
            className={`${inputClasses} min-h-11 py-2`}
          >
            <option value="">Choose…</option>
            {LEVELS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label={`Comment for ${pupil.name}`}
            value={rows[pupil.student].comment}
            onChange={(e) => setRows({ ...rows, [pupil.student]: { ...rows[pupil.student], comment: e.target.value } })}
            className={`${inputClasses} min-h-11 py-2`}
          />
        </div>
      ))}
      <Button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            await postJson(`${API}/descriptive`, {
              school_class: Number(klass),
              subject: Number(subject),
              term: Number(term),
              results: Object.entries(rows)
                .filter(([, row]) => row.level)
                .map(([student, row]) => ({ student: Number(student), ...row })),
            });
            setSaved(true);
          })
        }
      >
        Save
      </Button>
      {data.sheet.status === "DRAFT" && <ActButton label="Submit to the Head Teacher" path={`${API}/sheets/${data.sheet.id}/submit`} />}
      {alert}
      {saved && <p role="status">Saved.</p>}
    </div>
  );
}

type Sheet = { id: number; class: string; subject: string; term: string; status: string };

export function ResultsScreen() {
  const [term, setTerm] = useState("");
  const [klass, setKlass] = useState("");
  const query = new URLSearchParams({ ...(term && { term }), ...(klass && { class: klass }) }).toString();
  const { data, setData, error } = useLoad<Sheet[]>(`${API}/sheets${query ? `?${query}` : ""}`);
  const head = useRoleIs(HEAD_TEACHER);
  const rows = data ?? [];
  const replace = (row: Sheet) => setData(rows.map((each) => (each.id === row.id ? row : each)));
  return (
    <Section title="Results" intro="Marks submitted by teachers, then reviewed, approved and published to families.">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Picker id="results-term" label="Term" source="terms" value={term} onChange={setTerm} includeAll="Every term" />
        <Picker id="results-class" label="Class" source="classes" value={klass} onChange={setKlass} includeAll="Every class" />
      </div>
      {klass && term && (
        <p className="mb-4">
          <Link href={`/results/class?class=${klass}&term=${term}`} className="font-semibold underline">
            See this class&apos;s results and positions
          </Link>
        </p>
      )}
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No marks submitted yet." />
      {rows.length > 0 && (
        <Table
          caption="Result sheets"
          head={["Class", "Subject", "Term", "Status", ""]}
          rows={rows.map((sheet) => [
            sheet.class,
            sheet.subject,
            sheet.term,
            words(sheet.status),
            <span key="a" className="flex flex-wrap gap-2">
              {sheet.status === "SUBMITTED" && <ActButton label="Reviewed" path={`${API}/sheets/${sheet.id}/review`} onDone={(r) => replace(r as Sheet)} />}
              {head && ["SUBMITTED", "REVIEWED"].includes(sheet.status) && (
                <ActButton label="Approve" path={`${API}/sheets/${sheet.id}/approve`} onDone={(r) => replace(r as Sheet)} />
              )}
              {["SUBMITTED", "REVIEWED"].includes(sheet.status) && (
                <ActButton label="Return" path={`${API}/sheets/${sheet.id}/return`} onDone={(r) => replace(r as Sheet)} />
              )}
              {head && sheet.status === "APPROVED" && (
                <ActButton label="Publish" confirm="Publish to families?" path={`${API}/sheets/${sheet.id}/publish`} onDone={(r) => replace(r as Sheet)} />
              )}
            </span>,
          ])}
        />
      )}
    </Section>
  );
}

type ClassResults = {
  class: string;
  term: string;
  positions: boolean;
  subjects: string[];
  pupils: { student: number; name: string; average: number | null; position: number | null; subjects: Record<string, { total: number; grade: string }> }[];
};

export function ClassResultsScreen() {
  const params = useSearchParams();
  const klass = params.get("class") ?? "0";
  const term = params.get("term") ?? "0";
  const { data, error } = useLoad<ClassResults>(`${API}/classes/${Number(klass)}/results?term=${Number(term)}`);
  return (
    <Section title={data ? `${data.class}, ${data.term}` : "Class results"}>
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <Table
          caption="Class results"
          head={["Pupil", ...data.subjects, "Average", ...(data.positions ? ["Position"] : []), ""]}
          rows={data.pupils.map((pupil) => [
            pupil.name,
            ...data.subjects.map((name) => (pupil.subjects[name] ? `${pupil.subjects[name].total} ${pupil.subjects[name].grade}` : "—")),
            pupil.average ?? "—",
            ...(data.positions ? [pupil.position ?? "—"] : []),
            <Link key="r" href={`/report-card?pupil=${pupil.student}&term=${term}`} className="underline">
              Report card
            </Link>,
          ])}
        />
      )}
    </Section>
  );
}

export type ReportCard = {
  school: { name: string; phone: string; email: string };
  pupil: { id: number; name: string; student_id: string };
  class: string;
  term: string;
  withheld: boolean;
  would_be_withheld?: boolean;
  style?: string;
  class_teacher?: string | null;
  class_size?: number;
  positions?: boolean;
  subjects: Record<string, { total: number; grade: string; remark: string; position: number | null }>;
  average?: number | null;
  position?: number | null;
  descriptive: { subject: string; level: string; comment: string }[];
  attendance: { days: number; present: number; late: number; absent: number; rate: number | null } | null;
  remarks: {
    conduct: string;
    interest: string;
    class_teacher: string;
    head_teacher: string;
    promotion: string;
    reopening_date: string | null;
  } | null;
};

/** The printable report card, shared by staff, parents and pupils. */
export function ReportCardView({ card }: { card: ReportCard }) {
  if (card.withheld) {
    return (
      <p className="rounded-card border border-line bg-card p-5">
        This report card is being held until the school fees are settled. Please contact the school.
      </p>
    );
  }
  return (
    <article className="space-y-5 rounded-card border border-line bg-card p-6 print:border-0">
      <header>
        <h2 className="text-2xl font-semibold">{card.school.name}</h2>
        <p className="text-ink-muted">Report card · {card.term}</p>
        <p className="mt-2">
          <strong>{card.pupil.name}</strong> ({card.pupil.student_id}) · {card.class}
          {card.class_teacher && ` · Class teacher: ${card.class_teacher}`}
        </p>
      </header>
      {Object.keys(card.subjects).length > 0 && (
        <Table
          caption="Subjects"
          head={["Subject", "Total", "Grade", "Remark", ...(card.positions ? ["Position"] : [])]}
          rows={Object.entries(card.subjects).map(([name, row]) => [
            name,
            row.total,
            row.grade || "—",
            row.remark || "—",
            ...(card.positions ? [row.position ?? "—"] : []),
          ])}
        />
      )}
      {card.descriptive.length > 0 && (
        <Table caption="Learning areas" head={["Area", "Level", "Comment"]} rows={card.descriptive.map((d) => [d.subject, d.level, d.comment || "—"])} />
      )}
      {Object.keys(card.subjects).length === 0 && card.descriptive.length === 0 && <p>No results have been published for this term yet.</p>}
      {card.average !== undefined && card.average !== null && (
        <p>
          Average: <strong>{card.average}</strong>
          {card.positions && card.position && ` · Position ${card.position} of ${card.class_size}`}
        </p>
      )}
      {card.attendance && (
        <p>
          Attendance: present {card.attendance.present + card.attendance.late} of {card.attendance.days} days
          {card.attendance.rate !== null && ` (${card.attendance.rate}%)`}.
        </p>
      )}
      {card.remarks && (
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          {(
            [
              ["Conduct", card.remarks.conduct],
              ["Interest", card.remarks.interest],
              ["Class teacher", card.remarks.class_teacher],
              ["Head Teacher", card.remarks.head_teacher],
              ["Promotion", card.remarks.promotion],
              ["School reopens", card.remarks.reopening_date ? when(card.remarks.reopening_date) : ""],
            ] as const
          )
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      )}
      <Button className="print:hidden" onClick={() => window.print()}>
        Print
      </Button>
    </article>
  );
}

export function ReportCardScreen() {
  const params = useSearchParams();
  const pupil = Number(params.get("pupil")) || 0;
  const term = Number(params.get("term")) || 0;
  const { data, error, reload } = useLoad<ReportCard>(`${API}/pupils/${pupil}/report-card?term=${term}`);
  const head = useRoleIs(HEAD_TEACHER);
  const [reason, setReason] = useState("");
  return (
    <Section title="Report card">
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <div className="space-y-6">
          <ReportCardView card={data} />
          <Panel title="Remarks">
            <RecordForm
              idPrefix="remarks"
              submitLabel="Save remarks"
              row={{
                id: 0,
                conduct: data.remarks?.conduct ?? "",
                interest: data.remarks?.interest ?? "",
                class_teacher_remark: data.remarks?.class_teacher ?? "",
                promotion: data.remarks?.promotion ?? "",
                reopening_date: data.remarks?.reopening_date ?? "",
                ...(head && { head_teacher_remark: data.remarks?.head_teacher ?? "" }),
              }}
              fields={[
                { name: "conduct", label: "Conduct" },
                { name: "interest", label: "Interest" },
                { name: "class_teacher_remark", label: "Class teacher's remark", type: "textarea" },
                ...(head ? [{ name: "head_teacher_remark", label: "Head Teacher's remark", type: "textarea" as const }] : []),
                { name: "promotion", label: "Promotion" },
                { name: "reopening_date", label: "School reopens", type: "date" },
              ]}
              send={(body) => putJson<Row>(`${API}/pupils/${pupil}/remarks`, { term, ...body })}
              onSaved={reload}
            />
          </Panel>
          {head && data.would_be_withheld && (
            <Panel title="Withheld for unpaid fees">
              <p>Families can&apos;t see this report card while fees are owed. You can release it.</p>
              <InputField id="release-reason" label="Reason" value={reason} onChange={setReason} required />
              <ActButton label="Release to the family" path={`${API}/pupils/${pupil}/release-report`} body={{ term, reason }} onDone={reload} />
            </Panel>
          )}
        </div>
      )}
    </Section>
  );
}

// ---- Lesson notes, timetable, resources ----------------------------------------------------

export function LessonNotesScreen() {
  const teacher = useRoleIs(TEACHER, CAREGIVER);
  const leader = useRoleIs(...LEADERS);
  return (
    <Section title="Lesson notes" intro="Teachers write a note for each week; the Head Teacher reviews it.">
      <RecordsView
        path={`${API}/lesson-notes`}
        noun="lesson note"
        title={(row) => `${String(row.subject_label)}, ${String(row.school_class_label)} · week of ${when(row.week_start)}`}
        fields={[
          { name: "school_class", label: "Class", type: "option", options: "classes", required: true },
          { name: "subject", label: "Subject", type: "option", options: "subjects", required: true },
          { name: "week_start", label: "Week starting", type: "date", required: true },
          { name: "template", label: "Template", type: "option", options: "templates" },
          { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["DRAFT", "Draft"], ["SUBMITTED", "Submitted"], ["RETURNED", "Returned for changes"], ["REVIEWED", "Reviewed"], ["APPROVED", "Approved"]] },
          { name: "review_comment", label: "Head Teacher's comment", readOnly: true },
        ]}
        canAdd={teacher}
        canEdit={teacher}
        actions={(row, replace) => (
          <>
            <Link href={`/lesson-notes/write?id=${row.id}`} className="font-semibold underline">
              {teacher && ["DRAFT", "RETURNED"].includes(String(row.status)) ? "Write the note" : "Read the note"}
            </Link>
            {teacher && ["DRAFT", "RETURNED"].includes(String(row.status)) && (
              <ActButton label="Submit" path={`${API}/lesson-notes/${row.id}/submit`} onDone={(r) => replace(r as Row)} />
            )}
            {leader && row.status === "SUBMITTED" && <ReviewNote id={row.id} onDone={replace} />}
          </>
        )}
      />
    </Section>
  );
}

function ReviewNote({ id, onDone }: { id: number; onDone: (row: Row) => void }) {
  const [comment, setComment] = useState("");
  return (
    <span className="flex flex-wrap items-end gap-2">
      <InputField id={`review-${id}`} label="Comment" value={comment} onChange={setComment} />
      <ActButton label="Approve" path={`${API}/lesson-notes/${id}/review`} body={{ status: "APPROVED", comment }} onDone={(r) => onDone(r as Row)} />
      <ActButton label="Return" path={`${API}/lesson-notes/${id}/review`} body={{ status: "RETURNED", comment }} onDone={(r) => onDone(r as Row)} />
    </span>
  );
}

type Note = Row & { content: Record<string, string>; template: number | null; status: string };

export function WriteNoteScreen() {
  const id = Number(useSearchParams().get("id")) || 0;
  const { data, error } = useLoad<Note>(`${API}/lesson-notes/${id}`);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return <NoteEditor note={data} />;
}

function NoteEditor({ note }: { note: Note }) {
  const templates = useLoad<{ id: number; name: string; sections: string[] }[]>(`${API}/note-templates`);
  const sections = templates.data?.find((t) => t.id === note.template)?.sections ?? ["Objectives", "Activities", "Assessment"];
  const [content, setContent] = useState<Record<string, string>>(note.content ?? {});
  const editable = ["DRAFT", "RETURNED"].includes(note.status);
  const { error, attempt, busy, run } = useSubmit();
  const [saved, setSaved] = useState(false);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await patchJson(`${API}/lesson-notes/${note.id}`, { content });
      setSaved(true);
    });
  }
  return (
    <Section title={`${String(note.subject_label)}, ${String(note.school_class_label)}`} intro={`Week of ${when(note.week_start)}`}>
      <form onSubmit={onSubmit} className="max-w-3xl space-y-4">
        <FormAlert message={error} focusKey={attempt} />
        {sections.map((section) => (
          <label key={section} className="block font-medium">
            {section}
            <textarea
              value={content[section] ?? ""}
              disabled={!editable}
              onChange={(e) => setContent({ ...content, [section]: e.target.value })}
              className={`${textareaClasses} mt-2`}
            />
          </label>
        ))}
        {editable && (
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save note"}
          </Button>
        )}
        {saved && <p role="status">Saved.</p>}
      </form>
    </Section>
  );
}

const DAYS: [string, string][] = [
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
];

export function TimetableScreen() {
  const leader = useRoleIs(...LEADERS);
  const mine = useLoad<{ term: string; slots: { day: number; period: string; class: string; subject: string }[]; covers: { date: string; period: string; class: string; subject: string }[] }>(
    `${API}/my-timetable`,
  );
  return (
    <Section title="Timetable" intro="Lessons for the term. A teacher can't be in two classes at once.">
      <div className="space-y-10">
        {mine.data && mine.data.slots.length > 0 && (
          <Panel title={`My lessons, ${mine.data.term}`}>
            <Table
              caption="My lessons"
              head={["Day", "Period", "Class", "Subject"]}
              rows={mine.data.slots.map((s) => [DAYS[s.day - 1]?.[1] ?? s.day, s.period, s.class, s.subject])}
            />
            {mine.data.covers.length > 0 && (
              <Table caption="Cover" head={["Date", "Period", "Class", "Subject"]} rows={mine.data.covers.map((c) => [when(c.date), c.period, c.class, c.subject])} />
            )}
          </Panel>
        )}
        <Panel title="Lessons">
          <RecordsView
            path={`${API}/timetable`}
            noun="lesson"
            title={(row) => `${String(row.school_class_label)} · ${DAYS.find(([d]) => d === String(row.day))?.[1] ?? ""} ${String(row.period_label)}`}
            fields={[
              { name: "term", label: "Term", type: "option", options: "terms", required: true },
              { name: "school_class", label: "Class", type: "option", options: "classes", required: true },
              { name: "day", label: "Day", type: "choice", required: true, choices: DAYS },
              { name: "period", label: "Period", type: "option", options: "periods", required: true },
              { name: "subject", label: "Subject", type: "option", options: "subjects", required: true },
              { name: "staff", label: "Teacher", type: "option", options: "staff" },
            ]}
            canAdd={leader}
            canEdit={leader}
            canDelete={leader}
          />
        </Panel>
        {leader && (
          <>
            <Panel title="Periods">
              <RecordsView
                path={`${API}/periods`}
                noun="period"
                fields={[
                  { name: "name", label: "Name", required: true },
                  { name: "start_time", label: "Starts", type: "time", required: true },
                  { name: "end_time", label: "Ends", type: "time", required: true },
                  { name: "order", label: "Order", type: "number" },
                ]}
                canAdd
                canEdit
                canDelete
              />
            </Panel>
            <CoverPanel />
          </>
        )}
      </div>
    </Section>
  );
}

function CoverPanel() {
  const [date, setDate] = useState(today());
  const { data } = useLoad<{ slot: number; period: string; class: string; subject: string; teacher: string }[]>(`${API}/cover-needed?date=${date}`);
  return (
    <Panel title="Cover">
      <DatePick id="cover-date" label="Day" value={date} onChange={setDate} />
      {data && data.length > 0 ? (
        <Table caption="Lessons needing cover" head={["Period", "Class", "Subject", "Teacher away"]} rows={data.map((s) => [s.period, s.class, s.subject, s.teacher])} />
      ) : (
        <p className="text-ink-muted">No lessons need cover on this day.</p>
      )}
      <RecordsView
        path={`${API}/covers`}
        query={`date=${date}`}
        noun="cover"
        fields={[
          { name: "slot", label: "Lesson", type: "option", options: "slots", required: true },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "substitute", label: "Covered by", type: "option", options: "staff", required: true },
          { name: "note", label: "Note" },
        ]}
        canAdd
        canDelete
      />
    </Panel>
  );
}

type Resource = { id: number; title: string; subject: string; class: string; kind: string; url: string; has_file: boolean; description: string; created_at: string };

export function ResourcesScreen() {
  const canShare = useRoleIs(TEACHER, CAREGIVER, ...LEADERS);
  const { data, error, reload } = useLoad<Resource[]>(`${API}/resources`);
  const rows = data ?? [];
  return (
    <Section title="Resources" intro="Notes, worksheets and links shared with classes. Families and pupils see those for their class.">
      {canShare && <ShareResource onDone={reload} />}
      <div className="mt-6">
        <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="Nothing shared yet." />
        <ul className="grid gap-4 lg:grid-cols-2">
          {rows.map((item) => (
            <li key={item.id}>
              <ResourceCard item={item} filePath={`${API}/resources/${item.id}`} />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

export function ResourceCard({ item, filePath }: { item: Resource; filePath: string }) {
  return (
    <article className="h-full rounded-card border border-line bg-card p-5">
      <h3 className="font-semibold">{item.title}</h3>
      <p className="text-sm text-ink-muted">{[item.subject, item.class].filter(Boolean).join(" · ") || "Everyone"}</p>
      {item.description && <p className="mt-2">{item.description}</p>}
      <p className="mt-3">
        {item.has_file ? (
          <a href={filePath} className="font-semibold underline">
            Download
          </a>
        ) : (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Open link
          </a>
        )}
      </p>
    </article>
  );
}

function ShareResource({ onDone }: { onDone: () => void }) {
  const [values, setValues] = useState({ title: "", kind: "LINK", url: "", description: "", school_class: "", subject: "" });
  const [file, setFile] = useState<File | null>(null);
  const { error, attempt, busy, run, fail } = useSubmit();
  const set = (key: string) => (value: string) => setValues({ ...values, [key]: value });
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.title.trim()) return fail("Give it a title.");
    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => value && form.append(key, value));
    if (values.kind === "FILE" && file) form.append("file", file);
    void run(async () => {
      await postForm(`${API}/resources`, form);
      setValues({ title: "", kind: "LINK", url: "", description: "", school_class: "", subject: "" });
      onDone();
    });
  }
  return (
    <Panel title="Share a resource">
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <FormAlert message={error} focusKey={attempt} />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField id="resource-title" label="Title" value={values.title} onChange={set("title")} required />
          <label className="block text-sm font-medium">
            What
            <select value={values.kind} onChange={(e) => set("kind")(e.target.value)} className={`${inputClasses} mt-1 min-h-11 py-2`}>
              <option value="LINK">A link</option>
              <option value="FILE">A file</option>
            </select>
          </label>
          {values.kind === "LINK" ? (
            <InputField id="resource-url" label="Link" value={values.url} onChange={set("url")} required />
          ) : (
            <label className="block text-sm font-medium">
              File (PDF, Word, PowerPoint, Excel or a picture, under 10 MB)
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block min-h-11 w-full" />
            </label>
          )}
          <Picker id="resource-class" label="Class" source="classes" value={values.school_class} onChange={set("school_class")} includeAll="Every class" />
          <Picker id="resource-subject" label="Subject" source="subjects" value={values.subject} onChange={set("subject")} includeAll="—" />
          <InputField id="resource-description" label="Description" value={values.description} onChange={set("description")} />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Sharing…" : "Share"}
        </Button>
      </form>
    </Panel>
  );
}

// ---- Quizzes --------------------------------------------------------------------------------

type Question = { id: number; kind: string; text: string; options: string[]; answer: string; marks: number; approved: boolean; from_ai: boolean };

export function QuizzesScreen() {
  return (
    <Section title="Quizzes" intro="Write questions, or have AI draft them for you to check. Pupils answer once and are marked straight away.">
      <RecordsView
        path={`${API}/quizzes`}
        noun="quiz"
        fields={[
          { name: "title", label: "Title", required: true },
          { name: "topic", label: "Topic", required: true },
          { name: "school_class", label: "Class", type: "option", options: "classes", required: true },
          { name: "subject", label: "Subject", type: "option", options: "subjects", required: true },
          { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["DRAFT", "Draft"], ["PUBLISHED", "Open to pupils"], ["CLOSED", "Closed"]] },
        ]}
        canAdd
        canEdit
        canDelete
        actions={(row) => (
          <Link href={`/quizzes/edit?id=${row.id}`} className="font-semibold underline">
            {row.status === "DRAFT" ? "Questions" : "Results"}
          </Link>
        )}
      />
    </Section>
  );
}

export function QuizEditScreen() {
  const id = Number(useSearchParams().get("id")) || 0;
  const quiz = useLoad<Row>(`${API}/quizzes/${id}`);
  const questions = useLoad<Question[]>(`${API}/quizzes/${id}/questions`);
  const [count, setCount] = useState("5");
  const [difficulty, setDifficulty] = useState("medium");
  const { act, busy, alert } = useAction();
  const draft = quiz.data?.status === "DRAFT";
  const list = questions.data ?? [];
  return (
    <Section title={quiz.data ? String(quiz.data.title) : "Quiz"} intro={quiz.data ? `Topic: ${String(quiz.data.topic)} · ${words(quiz.data.status)}` : undefined}>
      <LoadState error={quiz.error} loading={!quiz.data && !quiz.error} empty={false} emptyText="" />
      {draft && (
        <div className="space-y-6">
          <Panel title="Draft questions with AI">
            <p className="text-sm text-ink-muted">Only the topic, level and difficulty are sent. Check every drafted question before publishing.</p>
            <div className="flex flex-wrap items-end gap-3">
              <InputField id="ai-count" label="How many" value={count} onChange={setCount} />
              <label className="block text-sm font-medium">
                Difficulty
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={`${inputClasses} mt-1 min-h-11 py-2`}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await postJson(`${API}/quizzes/${id}/draft`, { count: Number(count) || 5, difficulty });
                    questions.reload();
                  })
                }
              >
                {busy ? "Drafting…" : "Draft questions"}
              </Button>
            </div>
            {alert}
          </Panel>
          <Panel title="Add a question">
            <RecordForm
              idPrefix="question"
              submitLabel="Add question"
              fields={[
                { name: "kind", label: "Kind", type: "choice", required: true, choices: [["CHOICE", "Multiple choice"], ["SHORT", "Short answer"]] },
                { name: "text", label: "Question", type: "textarea", required: true },
                { name: "options", label: "Choices", type: "list", hint: "Separated by commas (multiple choice only)" },
                { name: "answer", label: "Answer", required: true },
                { name: "marks", label: "Marks", type: "number" },
              ]}
              send={(body) => postJson<Row>(`${API}/quizzes/${id}/questions`, { ...body, approved: true })}
              onSaved={questions.reload}
            />
          </Panel>
        </div>
      )}
      <ol className="mt-6 list-inside list-decimal space-y-3">
        {list.map((question) => (
          <li key={question.id} className="rounded-card border border-line bg-card p-4">
            <span className="font-semibold">{question.text}</span>
            {question.options.length > 0 && <span className="block text-sm">Choices: {question.options.join(" · ")}</span>}
            <span className="block text-sm">
              Answer: <strong>{question.answer}</strong> · {question.marks} mark{question.marks === 1 ? "" : "s"}
              {question.from_ai && " · drafted by AI"}
            </span>
            {draft && !question.approved && (
              <span className="mt-2 flex flex-wrap gap-2">
                <ActButton label="Looks right" method="patch" path={`${API}/questions/${question.id}`} body={{ approved: true }} onDone={questions.reload} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {draft && list.length > 0 && (
        <div className="mt-6">
          <ActButton label="Open to pupils" variant="primary" path={`${API}/quizzes/${id}/publish`} onDone={quiz.reload} />
        </div>
      )}
      {quiz.data && !draft && <QuizResults id={id} />}
    </Section>
  );
}

function QuizResults({ id }: { id: number }) {
  const { data } = useLoad<{
    out_of: number;
    average: string | null;
    attempts: { student: string; score: string; submitted_at: string }[];
    questions: { id: number; text: string; answered: number; correct_percent: number | null }[];
  }>(`${API}/quizzes/${id}/results`);
  if (!data) return null;
  return (
    <div className="mt-8 space-y-6">
      <p>
        {data.attempts.length} pupils answered. Average {data.average ?? "—"} out of {data.out_of}.
      </p>
      <Table caption="Scores" head={["Pupil", "Score", "When"]} rows={data.attempts.map((a) => [a.student, `${a.score} / ${data.out_of}`, when(a.submitted_at)])} />
      <Table
        caption="Questions"
        head={["Question", "Answered", "Got it right"]}
        rows={data.questions.map((q) => [q.text, q.answered, q.correct_percent === null ? "—" : `${q.correct_percent}%`])}
      />
      <ActButton label="Close the quiz" path={`${API}/quizzes/${id}/close`} />
    </div>
  );
}

// ---- Daily care (early years) ---------------------------------------------------------------

export function DailyCareScreen() {
  const carer = useRoleIs(CAREGIVER, TEACHER);
  return (
    <Section title="Daily care" intro="The day's report for each young child, shared with their family.">
      <div className="space-y-10">
        <RecordsView
          path="/api/school/care/daily"
          query={`date=${today()}`}
          noun="daily report"
          fields={[
            { name: "student", label: "Child", type: "option", options: "pupils", required: true },
            { name: "date", label: "Date", type: "date", required: true },
            { name: "arrival", label: "Arrived", type: "time" },
            { name: "departure", label: "Left", type: "time" },
            { name: "meals", label: "Meals" },
            { name: "ate_well", label: "Ate well", type: "boolean" },
            { name: "sleep", label: "Sleep" },
            { name: "toilet", label: "Toilet" },
            { name: "mood", label: "Mood" },
            { name: "activities", label: "Activities", type: "textarea" },
            { name: "incident", label: "Anything happen?", type: "textarea" },
            { name: "supplies_needed", label: "Please send" },
            { name: "staff_signed", label: "Signed by staff", type: "boolean" },
          ]}
          canAdd={carer}
          canEdit={carer}
          emptyText="No reports today yet."
        />
        <Panel title="Notes with families">
          <RecordsView
            path="/api/school/care/notes"
            noun="note"
            title={(row) => `${String(row.student_label)}${row.from_parent ? " · from the family" : ""}`}
            fields={[
              { name: "student", label: "Child", type: "option", options: "pupils", required: true },
              { name: "text", label: "Note", type: "textarea", required: true },
              { name: "approved", label: "Shown", type: "boolean", readOnly: true },
            ]}
            canAdd={carer}
            actions={(row, replace) =>
              row.from_parent && !row.approved ? (
                <ActButton label="Approve" path={`/api/school/care/notes/${row.id}/approve`} onDone={(r) => replace(r as Row)} />
              ) : null
            }
          />
        </Panel>
      </div>
    </Section>
  );
}

