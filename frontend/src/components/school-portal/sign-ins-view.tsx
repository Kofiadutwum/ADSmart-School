"use client";

import { useState } from "react";
import { useAction, useLoad } from "@/components/portal/kit";
import { download } from "@/components/school-portal/import-view";
import { Field, inputClasses } from "@/components/site/field";
import { PageHead, Panel, Table } from "@/components/work/common";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client-api";
import type { ClassesData } from "@/lib/types";

type Kind = "pupils" | "parents" | "staff";
type Row = {
  name: string;
  password: string;
  signed_in: boolean;
  class?: string;
  student_id?: string;
  phone?: string;
  children?: string[];
  username?: string;
};

/** Each list's columns: heading, then how to read the cell from a row. */
const COLUMNS: Record<Kind, [string, (row: Row) => string][]> = {
  pupils: [
    ["Name", (row) => row.name],
    ["Class", (row) => row.class ?? ""],
    ["Student ID", (row) => row.student_id ?? ""],
  ],
  parents: [
    ["Name", (row) => row.name],
    ["Children", (row) => (row.children ?? []).join(", ")],
    ["Sign in with (phone)", (row) => row.phone ?? ""],
  ],
  staff: [
    ["Name", (row) => row.name],
    ["Username", (row) => row.username ?? ""],
  ],
};
const TITLE: Record<Kind, string> = { pupils: "Pupils' sign-ins", parents: "Parents' sign-ins", staff: "Staff sign-ins" };
const passwordText = (row: Row) => (row.signed_in ? "Has signed in" : row.password || "—");

/** The Administrator's sign-in lists, any time after an import. Passwords can't be read back,
 * so each list gives a fresh one-time password to everyone who hasn't signed in yet. */
export function SignInsView() {
  const [kind, setKind] = useState<Kind>("pupils");
  const [chosen, setChosen] = useState("");
  const [list, setList] = useState<{ kind: Kind; rows: Row[] } | null>(null);
  const classes = useLoad<ClassesData>("/api/school/classes");
  const { act, busy, alert } = useAction();

  const make = () =>
    act(async () => {
      const body = await postJson<{ rows: Row[] }>(`/api/school/sign-ins/${kind}`, chosen ? { class: chosen } : {});
      setList({ kind, rows: body.rows });
    });

  return (
    <div className="space-y-6">
      <PageHead
        title="Sign-in lists"
        intro="Student IDs, parents' sign-in phones and staff usernames, with a one-time password for each person who hasn't signed in yet. Print the list or download it for Excel."
      />
      <Panel title="Make a list">
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 font-semibold">Who</legend>
          {(
            [
              ["pupils", "Pupils"],
              ["parents", "Parents"],
              ["staff", "Staff"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="sign-in-kind"
                value={value}
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  setList(null);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {kind !== "staff" && (
          <Field id="sign-in-class" label="Class">
            {(props) => (
              <select {...props} value={chosen} onChange={(event) => setChosen(event.target.value)} className={inputClasses}>
                <option value="">Whole school</option>
                {(classes.data?.classes ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <p className="text-ink-muted">
          Everyone on the list who hasn&apos;t signed in yet gets a new one-time password, and any earlier one they
          haven&apos;t used stops working. People who have chosen their own password keep it.
          {kind === "pupils" && " Pupils below Basic 4 don't sign in, so only their Student ID is listed."}
        </p>
        <Button disabled={busy} onClick={() => void make()}>
          {busy ? "Making the list…" : "Make the list"}
        </Button>
        {alert}
      </Panel>

      {list && (
        <Panel
          title={TITLE[list.kind]}
          actions={
            <span className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.print()}>
                Print
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    `${list.kind}-sign-ins.csv`,
                    [...COLUMNS[list.kind].map(([head]) => head), "One-time password"],
                    list.rows.map((row) => [...COLUMNS[list.kind].map(([, cell]) => cell(row)), passwordText(row)]),
                  )
                }
              >
                Download (CSV)
              </Button>
            </span>
          }
        >
          {list.rows.length === 0 ? (
            <p className="text-ink-muted">Nobody to list.</p>
          ) : (
            <Table
              caption={TITLE[list.kind]}
              head={[...COLUMNS[list.kind].map(([head]) => head), "One-time password"]}
              rows={list.rows.map((row) => [
                ...COLUMNS[list.kind].map(([, cell]) => cell(row)),
                <span key="password" className={row.password ? "font-mono" : "text-ink-muted"}>
                  {passwordText(row)}
                </span>,
              ])}
            />
          )}
        </Panel>
      )}
    </div>
  );
}
