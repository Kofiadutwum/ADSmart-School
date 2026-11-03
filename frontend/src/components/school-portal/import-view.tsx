"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { NoticeTick, useAction } from "@/components/portal/kit";
import { inputClasses } from "@/components/site/field";
import { PageHead, Panel, Table } from "@/components/work/common";
import { Button, buttonClasses } from "@/components/ui/button";
import { postForm } from "@/lib/client-api";

type Kind = "pupils" | "staff";
type Problem = { row: number; message: string };
type PupilSummary = {
  pupils: number;
  new_parents: number;
  existing_parents: number;
  classes: string[];
  new_classes?: string[];
  unplaced: number;
};
type StaffSummary = { staff: number };
type Password = { name: string; username: string; one_time_password: string };
type PupilSlip = { name: string; class: string; student_id: string; password: string };
type ParentSlip = { name: string; phone: string; children: string[]; password: string };
type Slips = { passwords: Password[]; pupils: PupilSlip[]; parents: ParentSlip[] };
const NO_SLIPS: Slips = { passwords: [], pupils: [], parents: [] };

/** A spreadsheet of sign-in details to cut into slips; opens in Excel. */
export function download(name: string, head: string[], rows: string[][]) {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const text = "﻿" + [head, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

type Outcome = {
  kind: Kind;
  imported: boolean;
  problems: Problem[];
  summary: PupilSummary | StaffSummary | null;
  passwords?: Password[];
  pupils?: PupilSlip[];
  parents?: ParentSlip[];
  done?: number;
  total?: number;
};

const API = "/api/school/import";
/** Rows per request: staff are slower, because each gets a securely stored password. */
const BATCH: Record<Kind, number> = { pupils: 50, staff: 10 };
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Each column of the template and how to fill it in. */
const GUIDE: Record<Kind, [string, string, string][]> = {
  pupils: [
    ["First name, Surname", "Yes", "As on the birth certificate."],
    ["Middle name", "No", ""],
    ["Date of birth", "Yes", "DD/MM/YYYY, for example 14/03/2018."],
    ["Gender", "Yes", "M or F."],
    ["Class", "No", "As named under School setup, for example Basic 2A. Leave empty to place the pupil later under Enrolment."],
    ["Admission date", "No", "DD/MM/YYYY. Today if left empty."],
    ["Previous school, Address, Pick-up point", "No", ""],
    ["Parent 1 first name, surname, phone", "No", "The parent who pays and is the main contact. Their mobile number is how they sign in."],
    ["Parent 1 relationship", "No", "Mother, Father, Guardian or Other (Guardian if empty)."],
    ["Parent 1 email", "No", ""],
    ["Parent 2 …", "No", "A second parent, the same way."],
  ],
  staff: [
    ["First name, Surname", "Yes", ""],
    ["Username", "Yes", "What they sign in with: letters, numbers, dots or dashes, for example abena.owusu."],
    ["Roles", "Yes", "One or more, separated by semicolons, for example Teacher; Canteen Officer."],
    ["Phone, Email", "No", "Where sign-in codes go. The Administrator, Head Teacher, Accountant and Proprietor need one of them."],
    ["Staff number, Qualifications, Licence number, Emergency contact", "No", ""],
  ],
};

function what(kind: Kind, summary: Outcome["summary"]): string {
  if (!summary) return "";
  return kind === "pupils"
    ? plural((summary as PupilSummary).pupils, "pupil")
    : plural((summary as StaffSummary).staff, "staff member");
}

function readyText(kind: Kind, summary: Outcome["summary"]): string {
  if (kind === "staff") return `Ready to import ${what(kind, summary)}. Each gets a one-time password to change at first sign-in.`;
  const pupils = summary as PupilSummary;
  const parts = [
    plural(pupils.new_parents, "new parent account"),
    plural(pupils.existing_parents, "parent already registered", "parents already registered"),
  ];
  if (pupils.classes.length) parts.push(`placed in ${pupils.classes.join(", ")}`);
  if (pupils.unplaced) parts.push(`${plural(pupils.unplaced, "pupil")} not yet in a class`);
  if (pupils.new_classes?.length) parts.push(`creating ${plural(pupils.new_classes.length, "new class", "new classes")}`);
  return `Ready to import ${what(kind, summary)}: ${parts.join(", ")}.`;
}

/** Bulk import from a spreadsheet: check the whole file, fix what it lists, then import it all. */
export function ImportView({ initialKind }: { initialKind: Kind }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [file, setFile] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [informed, setInformed] = useState(false);
  const [progress, setProgress] = useState<({ done: number; total: number } & Slips) | null>(null);
  const { act, busy, alert } = useAction();

  const choose = (next: Kind) => {
    setKind(next);
    setFile(null);
    setOutcome(null);
    setInformed(false);
    setProgress(null);
  };
  const check = () =>
    act(async () => {
      if (!file) return;
      const form = new FormData();
      form.append("file", file);
      setProgress(null);
      setOutcome(await postForm<Outcome>(`${API}/${kind}`, form));
    });
  // Saved a batch at a time, so no request runs into the server's time limit. A batch sent
  // again (after a dropped connection) adds nobody twice, so Continue is always safe.
  const save = (from: number, earlier: Slips) =>
    act(async () => {
      if (!file || !outcome) return;
      let start = from;
      const passwords = [...earlier.passwords];
      const pupils = [...earlier.pupils];
      const parents = [...earlier.parents];
      for (;;) {
        const form = new FormData();
        form.append("file", file);
        form.append("commit", "1");
        form.append("privacy_notice_given", informed ? "1" : "0");
        form.append("start", String(start));
        form.append("count", String(BATCH[kind]));
        const result = await postForm<Outcome>(`${API}/${kind}`, form);
        if (result.problems.length > 0) {
          setOutcome(result);
          return;
        }
        passwords.push(...(result.passwords ?? []));
        pupils.push(...(result.pupils ?? []));
        parents.push(...(result.parents ?? []));
        start = result.done ?? start;
        const total = result.total ?? start;
        setProgress({ done: start, total, passwords, pupils, parents });
        if (start >= total) {
          setOutcome({ ...outcome, imported: true, passwords, pupils, parents });
          setProgress(null);
          return;
        }
      }
    });
  const clean = outcome && !outcome.imported && outcome.problems.length === 0 && outcome.summary;

  return (
    <div className="space-y-6">
      <PageHead
        title="Import from a spreadsheet"
        intro="Add many pupils with their parents, or many staff, at once from Excel or CSV. The whole file is checked first, and nothing is saved until every row is right."
      />

      <fieldset className="flex flex-wrap gap-6">
        <legend className="mb-2 font-semibold">What are you importing?</legend>
        {(
          [
            ["pupils", "Pupils and their parents"],
            ["staff", "Staff"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input type="radio" name="import-kind" value={value} checked={kind === value} onChange={() => choose(value)} />
            {label}
          </label>
        ))}
      </fieldset>

      <Panel
        title="1. Fill in the template"
        actions={
          <a href={`${API}/${kind}/template`} download className={buttonClasses("outline")}>
            Download the template (CSV)
          </a>
        }
      >
        <p className="text-ink-muted">
          Open it in Excel or Google Sheets, keep the first row as it is, and add one{" "}
          {kind === "pupils" ? "pupil" : "member of staff"} per row. Columns can be in any order, and you can leave out the
          ones you don&apos;t need. Up to 3,000 rows per file.
          {kind === "pupils" &&
            " Brothers and sisters who share a parent's phone number share one parent account, and the parents listed are also added as the pupil's emergency contacts."}
        </p>
        <Table
          caption="The template's columns"
          head={["Column", "Needed", "How to fill it in"]}
          rows={GUIDE[kind].map(([column, needed, how]) => [column, needed, how])}
        />
      </Panel>

      <Panel title="2. Check and import">
        <label htmlFor="import-file" className="block font-semibold">
          Spreadsheet file (Excel .xlsx or CSV)
        </label>
        <input
          key={kind}
          id="import-file"
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={inputClasses}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setOutcome(null);
          }}
        />
        <Button variant="outline" disabled={!file || busy} onClick={() => void check()}>
          {busy && !clean ? "Checking…" : "Check the file"}
        </Button>
        {alert}

        <div aria-live="polite" className="space-y-4">
          {outcome && outcome.problems.length > 0 && (
            <div className="space-y-2 rounded-control border border-danger bg-danger/10 p-4">
              <p className="font-semibold">
                {plural(outcome.problems.length, "thing")} to fix in the spreadsheet, then check it again. Nothing has been
                saved.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {outcome.problems.map((problem, index) => (
                  <li key={index}>{`Row ${problem.row}: ${problem.message}`}</li>
                ))}
              </ul>
            </div>
          )}
          {clean && (
            <div className="space-y-3">
              <p>{readyText(kind, outcome.summary)}</p>
              <NoticeTick
                label={`The ${kind === "pupils" ? "families" : "staff"} listed have been given the school's privacy notice.`}
                checked={informed}
                onChange={setInformed}
              />
              {progress && (
                <p role="status">
                  {busy ? "Importing…" : "Stopped:"} {progress.done} of {progress.total} rows saved.
                </p>
              )}
              {progress && !busy ? (
                <Button onClick={() => void save(progress.done, progress)}>Continue importing</Button>
              ) : (
                <Button disabled={busy || !informed} onClick={() => void save(0, NO_SLIPS)}>
                  {busy ? "Importing…" : `Import ${what(kind, outcome.summary)}`}
                </Button>
              )}
            </div>
          )}
          {outcome?.imported && (
            <div className="space-y-4">
              <p className="font-semibold text-success">
                Imported {what(kind, outcome.summary)}.{" "}
                <Link href={kind === "pupils" ? "/pupils" : "/staff"} className="underline">
                  See the {kind === "pupils" ? "pupils" : "staff"}
                </Link>
              </p>
              {outcome.pupils && outcome.pupils.length > 0 && (
                <Panel
                  title="Pupils' Student IDs and passwords"
                  actions={
                    <span className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => window.print()}>
                        Print
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          download(
                            "pupil-sign-ins.csv",
                            ["Name", "Class", "Student ID", "One-time password"],
                            (outcome.pupils ?? []).map((row) => [row.name, row.class, row.student_id, row.password]),
                          )
                        }
                      >
                        Download (CSV)
                      </Button>
                    </span>
                  }
                >
                  <p className="text-ink-muted">
                    Shown only now: print or download it. Pupils from Basic 4 sign in with their Student ID and this password,
                    then choose their own; younger pupils don&apos;t sign in.
                  </p>
                  <Table
                    caption="Pupils' Student IDs and passwords"
                    head={["Name", "Class", "Student ID", "One-time password"]}
                    rows={outcome.pupils.map((row) => [
                      row.name,
                      row.class,
                      row.student_id,
                      <span key="password" className="font-mono">
                        {row.password || "—"}
                      </span>,
                    ])}
                  />
                </Panel>
              )}
              {outcome.parents && outcome.parents.length > 0 && (
                <Panel
                  title="Parents' sign-ins"
                  actions={
                    <span className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => window.print()}>
                        Print
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          download(
                            "parent-sign-ins.csv",
                            ["Name", "Children", "Sign in with (phone)", "One-time password"],
                            (outcome.parents ?? []).map((row) => [row.name, row.children.join(", "), row.phone, row.password]),
                          )
                        }
                      >
                        Download (CSV)
                      </Button>
                    </span>
                  }
                >
                  <p className="text-ink-muted">
                    Shown only now. Parents sign in with their phone number and this password, then choose their own. Parents
                    who were already registered keep their own password and aren&apos;t listed.
                  </p>
                  <Table
                    caption="Parents' sign-ins"
                    head={["Name", "Children", "Sign in with", "One-time password"]}
                    rows={outcome.parents.map((row) => [
                      row.name,
                      row.children.join(", "),
                      row.phone,
                      <span key="password" className="font-mono">
                        {row.password}
                      </span>,
                    ])}
                  />
                </Panel>
              )}
              {outcome.passwords && outcome.passwords.length > 0 && (
                <Panel
                  title="One-time passwords"
                  actions={
                    <Button variant="outline" onClick={() => window.print()}>
                      Print this list
                    </Button>
                  }
                >
                  <p className="text-ink-muted">
                    Shown only now. Print the list or write it down, and hand each person theirs. They choose their own password
                    at first sign-in.
                  </p>
                  <Table
                    caption="One-time passwords"
                    head={["Name", "Username", "One-time password"]}
                    rows={outcome.passwords.map((row) => [
                      row.name,
                      row.username,
                      <span key="password" className="font-mono">
                        {row.one_time_password}
                      </span>,
                    ])}
                  />
                </Panel>
              )}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

/** The page: /import, or /import?kind=staff from the Staff page. */
export function ImportScreen() {
  return <ImportView initialKind={useSearchParams().get("kind") === "staff" ? "staff" : "pupils"} />;
}
