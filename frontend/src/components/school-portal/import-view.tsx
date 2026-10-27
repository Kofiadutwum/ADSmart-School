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
type PupilSummary = { pupils: number; new_parents: number; existing_parents: number; classes: string[]; unplaced: number };
type StaffSummary = { staff: number };
type Password = { name: string; username: string; one_time_password: string };
type Outcome = {
  kind: Kind;
  imported: boolean;
  problems: Problem[];
  summary: PupilSummary | StaffSummary | null;
  passwords?: Password[];
};

const API = "/api/school/import";
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
  return `Ready to import ${what(kind, summary)}: ${parts.join(", ")}.`;
}

/** Bulk import from a spreadsheet: check the whole file, fix what it lists, then import it all. */
export function ImportView({ initialKind }: { initialKind: Kind }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [file, setFile] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [informed, setInformed] = useState(false);
  const { act, busy, alert } = useAction();

  const choose = (next: Kind) => {
    setKind(next);
    setFile(null);
    setOutcome(null);
    setInformed(false);
  };
  const send = (commit: boolean) =>
    act(async () => {
      if (!file) return;
      const form = new FormData();
      form.append("file", file);
      if (commit) {
        form.append("commit", "1");
        form.append("privacy_notice_given", informed ? "1" : "0");
      }
      setOutcome(await postForm<Outcome>(`${API}/${kind}`, form));
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
          ones you don&apos;t need. Up to 500 rows per file; split longer lists.
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
        <Button variant="outline" disabled={!file || busy} onClick={() => void send(false)}>
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
              <Button disabled={busy || !informed} onClick={() => void send(true)}>
                {busy ? "Importing…" : `Import ${what(kind, outcome.summary)}`}
              </Button>
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
              {kind === "pupils" && (
                <p className="text-ink-muted">
                  Parents can sign in once they activate their account: send each one the activation text from the Parents page
                  when you are ready.
                </p>
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
