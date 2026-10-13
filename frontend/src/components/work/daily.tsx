"use client";

import { useState } from "react";
import { InputField, LoadState, useAction, useLoad } from "@/components/portal/kit";
import { RecordForm, RecordsView, type Row } from "@/components/portal/records-view";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { patchJson, postJson } from "@/lib/client-api";
import { ghs, toPesewas } from "@/lib/money";
import { ACCOUNTANT, CANTEEN, HEAD_TEACHER, PROPRIETOR } from "@/lib/school-roles";
import { ActButton, DatePick, Money, Panel, Picker, Section, Table, today, useRoleIs, when, words } from "./common";

const API = "/api/school/finance";
export const DAILY_TABS = [
  ["/daily-charges", "Today's list"],
  ["/daily-charges/rates", "Rates"],
  ["/daily-charges/exemptions", "Exemptions"],
  ["/daily-charges/late-edits", "Late edits"],
  ["/daily-charges/statements", "Weekly statements"],
  ["/daily-charges/cash", "Cash-ups"],
  ["/daily-charges/pay", "Teacher pay"],
] as const;

function DailySection({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  const staffOnly = useRoleIs(ACCOUNTANT, CANTEEN, HEAD_TEACHER, PROPRIETOR, "Administrator");
  return (
    <Section title={title} intro={intro} tabs={staffOnly ? DAILY_TABS : undefined}>
      {children}
    </Section>
  );
}

type Charge = {
  id: number;
  name: string;
  canteen: number;
  extra: number;
  bus: number;
  total: number;
  status: string;
  paid: number;
  method: string;
  wallet: number;
};
type DailyList = {
  id: number;
  class: string;
  date: string;
  status: string;
  charges: Charge[];
  cash_collected: number;
  expected: number;
};

export function DailyListScreen() {
  const [klass, setKlass] = useState("");
  const [date, setDate] = useState(today());
  return (
    <DailySection title="Daily charges" intro="Mark who paid the canteen, extra classes and bus today. What isn't paid comes out of the pupil's wallet when the day is closed.">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Picker id="daily-class" label="Class" source="classes" value={klass} onChange={setKlass} />
        <DatePick id="daily-date" label="Day" value={date} onChange={setDate} />
      </div>
      {klass ? <DayList key={`${klass}-${date}`} klass={klass} date={date} /> : <p className="text-ink-muted">Choose a class.</p>}
    </DailySection>
  );
}

function DayList({ klass, date }: { klass: string; date: string }) {
  const { data, setData, error } = useLoad<DailyList>(`${API}/daily/classes/${klass}?date=${date}`);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  const open = data.status === "OPEN";
  const replace = (row: Charge) => setData({ ...data, charges: data.charges.map((each) => (each.id === row.id ? row : each)) });
  return (
    <div className="space-y-4">
      <p>
        <strong>{data.class}</strong>, {when(data.date)}: expected {ghs(data.expected)}, cash taken {ghs(data.cash_collected)}.{" "}
        {open ? "Open" : "Closed"}.
      </p>
      <ul className="space-y-3">
        {data.charges.map((charge) => (
          <li key={charge.id}>
            <ChargeRow charge={charge} open={open} onSaved={replace} />
          </li>
        ))}
      </ul>
      {open && data.charges.length > 0 && (
        <ActButton
          label="Close the day"
          variant="primary"
          confirm="Close the day? Unpaid amounts come out of wallets."
          path={`${API}/daily/lists/${data.id}/close`}
          onDone={(result) => setData(result as DailyList)}
        />
      )}
    </div>
  );
}

function ChargeRow({ charge, open, onSaved }: { charge: Charge; open: boolean; onSaved: (row: Charge) => void }) {
  const { act, busy, alert } = useAction();
  const [method, setMethod] = useState(charge.method || "CASH");
  const [part, setPart] = useState("");
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [newStatus, setNewStatus] = useState("PAID");
  const mark = (status: string, paid = 0) =>
    act(async () => onSaved(await patchJson<Charge>(`${API}/daily/charges/${charge.id}`, { status, paid, method })));

  return (
    <article className="rounded-card border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{charge.name}</h3>
        <span className="text-sm text-ink-muted">
          {ghs(charge.total)} · {words(charge.status)}
          {charge.paid ? ` (${ghs(charge.paid)})` : ""} · wallet {ghs(charge.wallet)}
        </span>
      </div>
      {open && charge.status !== "EXEMPT" && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">
            Paid by
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${inputClasses} mt-1 min-h-11 py-2`}>
              <option value="CASH">Cash</option>
              <option value="MOMO">MoMo</option>
              <option value="WALLET">Wallet</option>
            </select>
          </label>
          <Button disabled={busy} onClick={() => void mark("PAID")}>
            Paid
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void mark("UNPAID")}>
            Not paid
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void mark("ABSENT")}>
            Absent
          </Button>
          <span className="inline-flex items-end gap-2">
            <InputField id={`part-${charge.id}`} label="Part paid (GHS)" value={part} onChange={setPart} />
            <Button
              variant="outline"
              disabled={busy || toPesewas(part) === null}
              onClick={() => void mark("PART", toPesewas(part) ?? 0)}
            >
              Part
            </Button>
          </span>
        </div>
      )}
      {!open && (
        <div className="mt-3">
          {asking ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-medium">
                Should be
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className={`${inputClasses} mt-1 min-h-11 py-2`}>
                  <option value="PAID">Paid</option>
                  <option value="UNPAID">Not paid</option>
                  <option value="ABSENT">Absent</option>
                  <option value="EXEMPT">Exempt</option>
                </select>
              </label>
              <InputField id={`late-${charge.id}`} label="Reason" value={reason} onChange={setReason} required />
              <div className="flex items-end">
                <ActButton
                  label="Ask the Head Teacher"
                  path={`${API}/daily/charges/${charge.id}/late-edit`}
                  body={{ new_status: newStatus, reason }}
                  onDone={() => setAsking(false)}
                />
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setAsking(true)}>
              Ask for a late edit
            </Button>
          )}
        </div>
      )}
      {alert}
    </article>
  );
}

export function RatesScreen() {
  const accountant = useRoleIs(ACCOUNTANT);
  const approver = useRoleIs(HEAD_TEACHER, PROPRIETOR);
  return (
    <DailySection title="Daily rates" intro="The daily amount per category; part is the canteen, the rest extra classes. A new rate applies once the Head Teacher approves it.">
      <RecordsView
        path={`${API}/rates`}
        noun="rate"
        fields={[
          { name: "category", label: "Category", type: "choice", required: true, choices: [["EARLY_YEARS", "Early Years"], ["PRIMARY", "Primary"], ["JHS", "JHS"]] },
          { name: "daily_amount", label: "Daily amount", type: "money", required: true },
          { name: "canteen_amount", label: "Of which canteen", type: "money", required: true },
          { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["PENDING", "Waiting for approval"], ["APPROVED", "Approved"]] },
        ]}
        canAdd={accountant}
        canEdit={accountant}
        actions={(row, replace) =>
          approver && row.status === "PENDING" ? (
            <ActButton label="Approve" path={`${API}/rates/${row.id}/approve`} onDone={(r) => replace(r as Row)} />
          ) : null
        }
      />
    </DailySection>
  );
}

export function ExemptionsScreen() {
  const canEdit = useRoleIs(ACCOUNTANT, HEAD_TEACHER);
  return (
    <DailySection title="Exemptions" intro="Pupils who don't pay the daily charge, or pay less.">
      <RecordsView
        path={`${API}/exemptions`}
        noun="exemption"
        fields={[
          { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
          { name: "kind", label: "Kind", type: "choice", required: true, choices: [["FULL", "Exempt"], ["REDUCED", "Reduced daily amount"]] },
          { name: "daily_amount", label: "Reduced daily amount", type: "money" },
          { name: "reason", label: "Reason", required: true },
          { name: "active", label: "Active", type: "boolean" },
        ]}
        canAdd={canEdit}
        canEdit={canEdit}
        canDelete={canEdit}
      />
    </DailySection>
  );
}

type LateEdit = { id: number; pupil: string; class: string; date: string; from_status: string; new_status: string; reason: string; status: string; requested_by: string };

export function LateEditsScreen() {
  const approver = useRoleIs(HEAD_TEACHER, PROPRIETOR);
  const { data, setData, error } = useLoad<LateEdit[]>(`${API}/late-edits`);
  const rows = data ?? [];
  const replace = (row: LateEdit) => setData(rows.map((each) => (each.id === row.id ? row : each)));
  return (
    <DailySection title="Late edits" intro="Changes to a closed day wait for the Head Teacher.">
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No late edits." />
      {rows.length > 0 && (
        <Table
          caption="Late edits"
          head={["Pupil", "Day", "Change", "Reason", "Status", ""]}
          rows={rows.map((row) => [
            `${row.pupil} (${row.class})`,
            when(row.date),
            `${words(row.from_status)} → ${words(row.new_status)}`,
            row.reason,
            words(row.status),
            approver && row.status === "PENDING" ? (
              <span key="a" className="flex flex-wrap gap-2">
                <ActButton label="Approve" path={`${API}/late-edits/${row.id}/decide`} body={{ approve: true }} onDone={(r) => replace(r as LateEdit)} />
                <ActButton label="Reject" path={`${API}/late-edits/${row.id}/decide`} body={{ approve: false }} onDone={(r) => replace(r as LateEdit)} />
              </span>
            ) : null,
          ])}
        />
      )}
    </DailySection>
  );
}

type Statement = {
  id: number;
  class: string;
  week_start: string;
  status: string;
  totals: { charged?: number; paid?: number; pupils?: Record<string, { name: string; days: number; charged: number; paid: number; wallet: number }> };
};

export function WeeklyStatementsScreen() {
  const canMake = useRoleIs(ACCOUNTANT, HEAD_TEACHER, PROPRIETOR);
  const approver = useRoleIs(HEAD_TEACHER, PROPRIETOR);
  const { data, setData, error, reload } = useLoad<Statement[]>(`${API}/weekly-statements`);
  const rows = data ?? [];
  const replace = (row: Statement) => setData(rows.map((each) => (each.id === row.id ? row : each)));
  return (
    <DailySection title="Weekly statements" intro="Each class's week: what was charged and paid. Approved statements are texted to families.">
      {canMake && (
        <Panel title="Make a statement">
          <RecordForm
            idPrefix="statement"
            submitLabel="Make statement"
            fields={[
              { name: "school_class", label: "Class", type: "option", options: "classes", required: true },
              { name: "week_start", label: "Any day in the week", type: "date", required: true },
            ]}
            send={(body) => postJson<Row>(`${API}/weekly-statements`, body)}
            onSaved={reload}
          />
        </Panel>
      )}
      <div className="mt-6 space-y-4">
        <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No statements yet." />
        {rows.map((row) => (
          <Panel
            key={row.id}
            title={`${row.class}, week of ${when(row.week_start)} · ${words(row.status)}`}
            actions={
              <span className="flex flex-wrap gap-2">
                {approver && row.status === "DRAFT" && (
                  <ActButton label="Approve" path={`${API}/weekly-statements/${row.id}/approve`} onDone={(r) => replace(r as Statement)} />
                )}
                {canMake && row.status === "APPROVED" && (
                  <ActButton label="Text families" confirm="Text every family their child's week?" path={`${API}/weekly-statements/${row.id}/send`} onDone={(r) => replace(r as Statement)} />
                )}
              </span>
            }
          >
            <p>
              Charged {ghs(row.totals.charged)}, paid {ghs(row.totals.paid)}.
            </p>
            <Table
              caption="Pupils"
              head={["Pupil", "Days", "Charged", "Paid", "Wallet"]}
              rows={Object.values(row.totals.pupils ?? {}).map((pupil) => [
                pupil.name,
                pupil.days,
                <Money key="c" value={pupil.charged} />,
                <Money key="p" value={pupil.paid} />,
                <Money key="w" value={pupil.wallet} />,
              ])}
            />
          </Panel>
        ))}
      </div>
    </DailySection>
  );
}

export function CashScreen() {
  const collector = useRoleIs(ACCOUNTANT, CANTEEN, "Bookshop Keeper");
  const signer = useRoleIs(ACCOUNTANT, HEAD_TEACHER, PROPRIETOR);
  const [date, setDate] = useState(today());
  const { data } = useLoad<{ payments: number; daily: number }>(`${API}/cash-expected?date=${date}`);
  return (
    <DailySection title="Cash-ups" intro="At the end of the day, count the cash and compare it with what the system expects.">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <DatePick id="cash-date" label="Day" value={date} onChange={setDate} />
        {data && (
          <p className="pb-2">
            You should hold <strong>{ghs(data.payments + data.daily)}</strong>: {ghs(data.payments)} in payments and {ghs(data.daily)} from daily lists.
          </p>
        )}
      </div>
      <div className="space-y-10">
        <Panel title="Cash-ups">
          <RecordsView
            path={`${API}/cash-ups`}
            noun="cash-up"
            fields={[
              { name: "date", label: "Day", type: "date", required: true },
              { name: "collector", label: "Who collected", type: "option", options: "users", required: true },
              { name: "expected", label: "Expected", type: "money", required: true },
              { name: "counted", label: "Counted", type: "money", required: true },
              { name: "difference", label: "Difference", type: "money", readOnly: true },
              { name: "note", label: "Note" },
            ]}
            canAdd={collector}
            actions={(row, replace) =>
              signer && !row.signed_off_by_label ? (
                <ActButton label="Sign off" path={`${API}/cash-ups/${row.id}/sign-off`} onDone={(r) => replace(r as Row)} />
              ) : row.signed_off_by_label ? (
                <span className="text-sm text-ink-muted">Signed off by {String(row.signed_off_by_label)}</span>
              ) : null
            }
          />
        </Panel>
        <Panel title="Hand-overs from class teachers">
          <RecordsView
            path={`${API}/handovers`}
            noun="hand-over"
            fields={[
              { name: "date", label: "Day", type: "date", required: true },
              { name: "school_class", label: "Class", type: "option", options: "classes", required: true },
              { name: "collector", label: "Handed over by", type: "option", options: "users", required: true },
              { name: "expected", label: "Expected", type: "money", required: true },
              { name: "counted", label: "Counted", type: "money", required: true },
              { name: "difference", label: "Difference", type: "money", readOnly: true },
              { name: "note", label: "Note" },
            ]}
            canAdd={useRoleIs(ACCOUNTANT, CANTEEN)}
          />
        </Panel>
      </div>
    </DailySection>
  );
}

type PayRun = {
  id: number;
  week_start: string;
  status: string;
  total: number;
  lines: { id: number; staff: string; amount: number; adjustment: number; adjustment_reason: string; total: number }[];
};

export function TeacherPayScreen() {
  const accountant = useRoleIs(ACCOUNTANT);
  const approver = useRoleIs(HEAD_TEACHER, PROPRIETOR);
  const { data, setData, error, reload } = useLoad<PayRun[]>(`${API}/pay-runs`);
  const [week, setWeek] = useState(today());
  const { act, busy, alert } = useAction();
  const runs = data ?? [];
  const replace = (row: PayRun) => setData([row, ...runs.filter((each) => each.id !== row.id)]);
  return (
    <DailySection title="Teacher pay" intro="Extra-class money paid to teachers by the school's rules, approved by the Head Teacher each week.">
      <div className="space-y-10">
        <Panel title="Pay rules">
          <RecordsView
            path={`${API}/pay-rules`}
            noun="pay rule"
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "scope", label: "Applies to", type: "choice", required: true, choices: [["CLASS", "One class"], ["CATEGORY", "Pooled across a category"]] },
              { name: "school_class", label: "Class", type: "option", options: "classes" },
              { name: "category", label: "Category", type: "choice", choices: [["EARLY_YEARS", "Early Years"], ["PRIMARY", "Primary"], ["JHS", "JHS"]] },
              {
                name: "method",
                label: "How it's worked out",
                type: "choice",
                required: true,
                choices: [["PERCENT", "Percentage of what was collected"], ["PER_PUPIL_DAY", "Amount per paying pupil per day"], ["FIXED", "Fixed amount a week"]],
              },
              { name: "value", label: "Percent, or amount in pesewas", type: "number", required: true },
              { name: "active", label: "Active", type: "boolean" },
            ]}
            canAdd={accountant}
            canEdit={accountant}
            canDelete={accountant}
          />
        </Panel>
        <Panel title="Weekly pay">
          {accountant && (
            <div className="flex flex-wrap items-end gap-3">
              <DatePick id="pay-week" label="Any day in the week" value={week} onChange={setWeek} />
              <Button
                disabled={busy}
                onClick={() => void act(async () => replace(await postJson<PayRun>(`${API}/pay-runs`, { week_start: week })))}
              >
                Work out pay
              </Button>
            </div>
          )}
          {alert}
          <LoadState error={error} loading={!data && !error} empty={runs.length === 0} emptyText="No weeks worked out yet." />
          {runs.map((run) => (
            <div key={run.id} className="space-y-2 border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">
                  Week of {when(run.week_start)}: {ghs(run.total)} · {words(run.status)}
                </h3>
                <span className="flex flex-wrap gap-2">
                  {approver && run.status === "DRAFT" && (
                    <ActButton label="Approve" path={`${API}/pay-runs/${run.id}/approve`} onDone={(r) => replace(r as PayRun)} />
                  )}
                  {accountant && run.status === "APPROVED" && (
                    <ActButton label="Mark paid" path={`${API}/pay-runs/${run.id}/paid`} body={{ reference: "" }} onDone={(r) => replace(r as PayRun)} />
                  )}
                </span>
              </div>
              <Table
                caption="Pay lines"
                head={["Teacher", "Worked out", "Adjustment", "To pay"]}
                rows={run.lines.map((line) => [
                  line.staff,
                  <Money key="a" value={line.amount} />,
                  line.adjustment ? `${ghs(line.adjustment)} (${line.adjustment_reason})` : "—",
                  <Money key="t" value={line.total} />,
                ])}
              />
            </div>
          ))}
          <Button variant="outline" onClick={reload}>
            Refresh
          </Button>
        </Panel>
      </div>
    </DailySection>
  );
}
