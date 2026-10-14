"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CHECK_FORM, LoadState, useLoad, useSubmit } from "@/components/portal/kit";
import { RecordForm, RecordsView, type FieldSpec, type Row } from "@/components/portal/records-view";
import { InputField } from "@/components/portal/kit";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { postForm, postJson } from "@/lib/client-api";
import { ghs } from "@/lib/money";
import { ACCOUNTANT, HEAD_TEACHER, PROPRIETOR } from "@/lib/school-roles";
import { ActButton, DatePick, Money, Panel, Picker, Section, Stat, Table, today, useRoleIs, when, words } from "./common";

export const MONEY_TABS = [
  ["/money", "Overview"],
  ["/money/fees", "Fees"],
  ["/money/invoices", "Invoices"],
  ["/money/payments", "Payments"],
  ["/money/debtors", "Debtors"],
  ["/money/refunds", "Refunds"],
  ["/money/wallets", "Wallets"],
  ["/money/links", "Payment links"],
  ["/money/statements", "Statements"],
] as const;

const API = "/api/school/finance";

function MoneySection({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <Section title={title} intro={intro} tabs={MONEY_TABS}>
      {children}
    </Section>
  );
}

type Summary = {
  today: number;
  this_week: number;
  this_term: number;
  outstanding: number;
  debtors: number;
  pending_refunds: number;
  pending_discounts: number;
};

export function MoneyHome() {
  const { data, error } = useLoad<Summary>(`${API}/summary`);
  return (
    <MoneySection title="Money" intro="What has come in, what is still owed and what needs a decision.">
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Collected today" value={<Money value={data.today} />} />
          <Stat label="This week" value={<Money value={data.this_week} />} />
          <Stat label="This term" value={<Money value={data.this_term} />} />
          <Stat label="Still owed" value={<Money value={data.outstanding} />} note={`${data.debtors} pupils owe fees`} />
          <Stat label="Refunds waiting" value={data.pending_refunds} />
          <Stat label="Discounts waiting" value={data.pending_discounts} />
        </dl>
      )}
      <div className="mt-8">
        <RecordPayment />
      </div>
    </MoneySection>
  );
}

const FEE_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", required: true },
  { name: "amount", label: "Amount", type: "money", required: true },
  { name: "academic_year", label: "School year", type: "option", options: "years", required: true },
  { name: "term", label: "Term", type: "option", options: "terms", hint: "Leave empty to charge every term" },
  {
    name: "charge_type",
    label: "Kind",
    type: "choice",
    choices: [
      ["TUITION", "Tuition"],
      ["PTA", "PTA dues"],
      ["BUS", "Bus"],
      ["CANTEEN", "Canteen plan"],
      ["EXTRA", "Extra classes"],
      ["BECE", "BECE fee"],
      ["MOCK", "Mock exams"],
      ["BOOKS", "Books"],
      ["UNIFORM", "Uniform"],
      ["OTHER", "Other"],
    ],
  },
  {
    name: "band",
    label: "Level",
    type: "choice",
    choices: [
      ["creche", "Crèche"],
      ["nursery", "Nursery"],
      ["kg", "Kindergarten"],
      ["lower_primary", "Basic 1–3"],
      ["upper_primary", "Basic 4–6"],
      ["jhs", "Junior High School"],
    ],
    hint: "Leave empty for every level",
  },
  { name: "school_class", label: "Only this class", type: "option", options: "classes" },
  { name: "optional", label: "Optional (pupils opt in)", type: "boolean" },
];

export function FeesScreen() {
  const accountant = useRoleIs(ACCOUNTANT);
  const approver = useRoleIs(HEAD_TEACHER, PROPRIETOR);
  return (
    <MoneySection title="Fees" intro="What each level pays per term, optional charges and discounts.">
      <div className="space-y-10">
        <RecordsView path={`${API}/fees`} noun="fee" fields={FEE_FIELDS} canAdd={accountant} canEdit={accountant} canDelete={accountant} emptyText="No fees set yet." />
        <Panel title="Optional charges taken">
          <RecordsView
            path={`${API}/optional-charges`}
            noun="optional charge"
            fields={[
              { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
              { name: "fee", label: "Charge", type: "option", options: "fees", required: true },
            ]}
            canAdd={accountant}
            canDelete={accountant}
            emptyText="No pupil has opted into a charge."
          />
        </Panel>
        <Panel title="Discounts">
          <RecordsView
            path={`${API}/discounts`}
            noun="discount"
            fields={[
              { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
              {
                name: "kind",
                label: "Kind",
                type: "choice",
                required: true,
                choices: [
                  ["SIBLING", "Sibling"],
                  ["STAFF_CHILD", "Staff child"],
                  ["BURSARY", "Bursary or scholarship"],
                  ["OTHER", "Other"],
                ],
              },
              { name: "percent", label: "Percent off", type: "number" },
              { name: "amount", label: "Fixed amount off", type: "money" },
              { name: "reason", label: "Reason", required: true },
              { name: "active", label: "Active", type: "boolean" },
              { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["PENDING", "Waiting for approval"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]] },
            ]}
            canAdd={accountant}
            canEdit={accountant}
            canDelete={accountant}
            emptyText="No discounts."
            actions={(row, replace) =>
              approver && row.status === "PENDING" ? (
                <>
                  <ActButton label="Approve" path={`${API}/discounts/${row.id}/decide`} body={{ approve: true }} onDone={(r) => replace(r as Row)} />
                  <ActButton label="Reject" path={`${API}/discounts/${row.id}/decide`} body={{ approve: false }} onDone={(r) => replace(r as Row)} />
                </>
              ) : null
            }
          />
        </Panel>
      </div>
    </MoneySection>
  );
}

type Invoice = {
  id: number;
  number: string;
  student: number;
  student_name: string;
  student_id: string;
  term: string;
  issued_on: string;
  due_on: string;
  status: string;
  total: number;
  arrears: number;
};

export function InvoicesScreen() {
  const accountant = useRoleIs(ACCOUNTANT);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const query = new URLSearchParams({ ...(term && { term }), ...(status && { status }) }).toString();
  const { data, error, reload } = useLoad<Invoice[]>(`${API}/invoices${query ? `?${query}` : ""}`);
  const rows = data ?? [];
  return (
    <MoneySection title="Invoices" intro="Each pupil's bill for the term: charges, discounts and anything owed from before.">
      {accountant && <IssueInvoices onIssued={reload} />}
      <div className="my-6 grid gap-4 sm:grid-cols-3">
        <Picker id="invoice-term" label="Term" source="terms" value={term} onChange={setTerm} includeAll="Every term" />
        <label className="block text-sm font-medium">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block min-h-11 w-full rounded-control border border-line bg-card px-3">
            <option value="">Any</option>
            <option value="OPEN">Open</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      </div>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No invoices yet." />
      {rows.length > 0 && (
        <Table
          caption="Invoices"
          head={["Number", "Pupil", "Term", "Total", "Owed before", "Due", "Status"]}
          rows={rows.map((row) => [
            <Link key="n" href={`/money/pupil?id=${row.student}`} className="font-semibold underline">
              {row.number}
            </Link>,
            `${row.student_name} (${row.student_id})`,
            row.term,
            <Money key="t" value={row.total} />,
            <Money key="a" value={row.arrears} />,
            when(row.due_on),
            words(row.status),
          ])}
        />
      )}
    </MoneySection>
  );
}

function IssueInvoices({ onIssued }: { onIssued: () => void }) {
  const [term, setTerm] = useState("");
  const [klass, setKlass] = useState("");
  const [due, setDue] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const { error, attempt, busy, run, fail } = useSubmit();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!term) return fail("Choose the term to invoice.");
    void run(async () => {
      const body = await postJson<{ issued: number; skipped: string[] }>(`${API}/invoices`, {
        term: Number(term),
        ...(klass && { school_class: Number(klass) }),
        ...(due && { due_on: due }),
      });
      setResult(
        `${body.issued} invoices issued.${body.skipped.length ? ` ${body.skipped.length} pupils already had one.` : ""}`,
      );
      onIssued();
    });
  }

  return (
    <Panel title="Issue invoices">
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <FormAlert message={error} focusKey={attempt} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Picker id="issue-term" label="Term" source="terms" value={term} onChange={setTerm} />
          <Picker id="issue-class" label="Class" source="classes" value={klass} onChange={setKlass} includeAll="Every active pupil" />
          <DatePick id="issue-due" label="Due on (optional)" value={due} onChange={setDue} />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Issuing…" : "Issue invoices"}
        </Button>
        {result && (
          <p role="status" className="text-sm">
            {result}
          </p>
        )}
      </form>
    </Panel>
  );
}

type Payment = {
  id: number;
  receipt_number: string;
  student: number;
  student_name: string;
  amount: number;
  method: string;
  purpose: string;
  reference: string;
  status: string;
  received_by: string;
  received_at: string;
};

export function RecordPayment({ onSaved }: { onSaved?: () => void }) {
  const accountant = useRoleIs(ACCOUNTANT);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  if (!accountant) return null;
  return (
    <Panel title="Record a payment">
      <RecordForm
        idPrefix="payment"
        submitLabel="Record payment"
        fields={[
          { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
          { name: "amount", label: "Amount", type: "money", required: true },
          {
            name: "method",
            label: "How it was paid",
            type: "choice",
            required: true,
            choices: [
              ["CASH", "Cash"],
              ["BANK", "Bank slip"],
              ["MOMO", "Mobile Money (direct)"],
              ["WALLET", "From the pupil's wallet"],
            ],
          },
          {
            name: "purpose",
            label: "For",
            type: "choice",
            required: true,
            choices: [
              ["FEES", "School fees"],
              ["WALLET", "Wallet top-up"],
            ],
          },
          { name: "reference", label: "Reference", hint: "Bank or MoMo reference" },
          { name: "payer_phone", label: "Payer's phone" },
          { name: "note", label: "Note" },
        ]}
        send={(body) => postJson<Row>(`${API}/payments`, body)}
        onSaved={(row) => {
          setReceipt(row as unknown as Payment);
          onSaved?.();
        }}
      />
      {receipt && (
        <p role="status" className="rounded-control bg-success/10 p-3">
          Receipt {receipt.receipt_number}: {ghs(receipt.amount)} from {receipt.student_name}.{" "}
          <Link href={`/money/receipt?id=${receipt.id}`} className="font-semibold underline">
            Print receipt
          </Link>
        </p>
      )}
    </Panel>
  );
}

export function PaymentsScreen() {
  const [date, setDate] = useState(today());
  const { data, error, reload } = useLoad<Payment[]>(`${API}/payments${date ? `?date=${date}` : ""}`);
  const rows = data ?? [];
  const total = rows.filter((row) => row.status === "CONFIRMED").reduce((sum, row) => sum + row.amount, 0);
  return (
    <MoneySection title="Payments" intro="Every payment gets a receipt number. A mistake is reversed with a reason, never deleted.">
      <RecordPayment onSaved={reload} />
      <div className="my-6 flex flex-wrap items-end gap-4">
        <DatePick id="payments-date" label="Day" value={date} onChange={setDate} />
        <p className="pb-2 font-semibold">Total: {ghs(total)}</p>
      </div>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No payments on this day." />
      {rows.length > 0 && (
        <Table
          caption="Payments"
          head={["Receipt", "Pupil", "Amount", "How", "For", "Status", "Taken by"]}
          rows={rows.map((row) => [
            <Link key="r" href={`/money/receipt?id=${row.id}`} className="font-semibold underline">
              {row.receipt_number}
            </Link>,
            row.student_name,
            <Money key="m" value={row.amount} />,
            words(row.method),
            words(row.purpose),
            words(row.status),
            row.received_by,
          ])}
        />
      )}
    </MoneySection>
  );
}

type Receipt = Payment & {
  student_id: string;
  balance_after: number;
  school: { name: string; phone: string; email: string };
};

export function ReceiptScreen() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error, setData } = useLoad<Receipt>(`${API}/payments/${Number(id) || 0}`);
  const canReverse = useRoleIs(ACCOUNTANT, HEAD_TEACHER, PROPRIETOR);
  const [reason, setReason] = useState("");
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <>
          <article className="rounded-card border border-line bg-card p-6 print:border-0">
            <h1 className="text-2xl font-semibold">{data.school.name}</h1>
            <p className="text-sm text-ink-muted">
              {data.school.phone} · {data.school.email}
            </p>
            <h2 className="mt-6 text-lg font-semibold">Receipt {data.receipt_number}</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-ink-muted">Pupil</dt>
              <dd>
                {data.student_name} ({data.student_id})
              </dd>
              <dt className="text-ink-muted">Amount</dt>
              <dd className="font-semibold">{ghs(data.amount)}</dd>
              <dt className="text-ink-muted">How</dt>
              <dd>{words(data.method)}</dd>
              <dt className="text-ink-muted">For</dt>
              <dd>{words(data.purpose)}</dd>
              <dt className="text-ink-muted">Date</dt>
              <dd>{when(data.received_at)}</dd>
              {data.reference && (
                <>
                  <dt className="text-ink-muted">Reference</dt>
                  <dd>{data.reference}</dd>
                </>
              )}
              <dt className="text-ink-muted">Balance after</dt>
              <dd>{ghs(data.balance_after)}</dd>
              {data.status === "REVERSED" && (
                <>
                  <dt className="text-ink-muted">Status</dt>
                  <dd className="font-semibold text-danger">Reversed</dd>
                </>
              )}
            </dl>
          </article>
          <div className="flex flex-wrap gap-3 print:hidden">
            <Button onClick={() => window.print()}>Print</Button>
          </div>
          {canReverse && data.status !== "REVERSED" && (
            <Panel title="Reverse this payment">
              <InputField id="reverse-reason" label="Reason" value={reason} onChange={setReason} required />
              <ActButton
                label="Reverse payment"
                path={`${API}/payments/${data.id}`}
                body={{ reason }}
                confirm="Reverse it? This can't be undone."
                onDone={() => setData({ ...data, status: "REVERSED" })}
              />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

type Debtor = { id: number; name: string; student_id: string; class: string; owed: number };

export function DebtorsScreen() {
  const { data, error } = useLoad<Debtor[]>(`${API}/debtors`);
  const rows = data ?? [];
  return (
    <MoneySection title="Debtors" intro="Pupils who owe school fees, most owed first.">
      <p className="mb-4">
        <a href="/api/school/reports/debtors.csv" className="font-semibold underline">
          Download for Excel
        </a>
      </p>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="Nobody owes fees." />
      {rows.length > 0 && (
        <Table
          caption="Debtors"
          head={["Pupil", "Class", "Owed"]}
          rows={rows.map((row) => [
            <Link key="p" href={`/money/pupil?id=${row.id}`} className="font-semibold underline">
              {row.name} ({row.student_id})
            </Link>,
            row.class || "—",
            <Money key="o" value={row.owed} />,
          ])}
        />
      )}
    </MoneySection>
  );
}

export function RefundsScreen() {
  const accountant = useRoleIs(ACCOUNTANT);
  const approver = useRoleIs(HEAD_TEACHER, PROPRIETOR);
  return (
    <MoneySection title="Refunds" intro="The Accountant asks; the Head Teacher or Proprietor decides.">
      <RecordsView
        path={`${API}/refunds`}
        noun="refund"
        fields={[
          { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
          { name: "account", label: "From", type: "choice", required: true, choices: [["FEES", "School fees credit"], ["WALLET", "Wallet"]] },
          { name: "amount", label: "Amount", type: "money", required: true },
          { name: "reason", label: "Reason", required: true },
          { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["PENDING", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]] },
        ]}
        canAdd={accountant}
        emptyText="No refunds asked for."
        actions={(row, replace) =>
          approver && row.status === "PENDING" ? (
            <>
              <ActButton label="Approve" path={`${API}/refunds/${row.id}/decide`} body={{ approve: true }} onDone={(r) => replace(r as Row)} />
              <ActButton label="Reject" path={`${API}/refunds/${row.id}/decide`} body={{ approve: false }} onDone={(r) => replace(r as Row)} />
            </>
          ) : null
        }
      />
    </MoneySection>
  );
}

export function WalletsScreen() {
  const { data, error } = useLoad<{ id: number; name: string; student_id: string; balance: number }[]>(`${API}/wallets`);
  const rows = data ?? [];
  return (
    <MoneySection title="Wallets" intro="Money held for each pupil's daily charges. Below zero means the day's charges are owed.">
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No wallet has money in it yet." />
      {rows.length > 0 && (
        <Table
          caption="Wallets"
          head={["Pupil", "Balance"]}
          rows={rows.map((row) => [
            <Link key="p" href={`/money/pupil?id=${row.id}`} className="underline">
              {row.name} ({row.student_id})
            </Link>,
            <span key="b" className={row.balance < 0 ? "font-semibold text-danger" : undefined}>
              {ghs(row.balance)}
            </span>,
          ])}
        />
      )}
    </MoneySection>
  );
}

export function LinksScreen() {
  const accountant = useRoleIs(ACCOUNTANT);
  const { data, error, reload } = useLoad<{ id: number; student: string; amount: number; expires_at: string }[]>(
    `${API}/payment-links`,
  );
  const rows = data ?? [];
  return (
    <MoneySection title="Payment links" intro="A text with a link the family can pay from, without signing in. Links last a week.">
      {accountant && (
        <Panel title="Send a payment link">
          <RecordForm
            idPrefix="link"
            submitLabel="Send link"
            fields={[
              { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
              { name: "amount", label: "Amount", type: "money", required: true },
              { name: "purpose", label: "For", type: "choice", required: true, choices: [["FEES", "School fees"], ["WALLET", "Wallet top-up"]] },
            ]}
            send={(body) => postJson<Row>(`${API}/payment-links`, body)}
            onSaved={reload}
          />
        </Panel>
      )}
      <div className="mt-6">
        <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No links sent yet." />
        {rows.length > 0 && (
          <Table caption="Links sent" head={["Pupil", "Amount", "Expires"]} rows={rows.map((row) => [row.student, <Money key="a" value={row.amount} />, when(row.expires_at)])} />
        )}
      </div>
    </MoneySection>
  );
}

type Statement = { id: number; source: string; file_name: string; created_at: string; unmatched: number; lines: number };
type Line = { id: number; date: string; amount: number; reference: string; description: string; status: string; payment: string };

export function StatementsScreen() {
  const accountant = useRoleIs(ACCOUNTANT);
  const { data, error, reload } = useLoad<Statement[]>(`${API}/statements`);
  const [open, setOpen] = useState<number | null>(null);
  const rows = data ?? [];
  return (
    <MoneySection title="Statements" intro="Upload a MoMo, Paystack or bank statement; lines that match a payment's reference and amount are ticked off.">
      {accountant && <UploadStatement onDone={reload} />}
      <div className="mt-6 space-y-4">
        <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No statements uploaded." />
        {rows.map((row) => (
          <Panel
            key={row.id}
            title={`${words(row.source)} · ${row.file_name}`}
            actions={
              <Button variant="outline" onClick={() => setOpen(open === row.id ? null : row.id)}>
                {open === row.id ? "Hide lines" : `Show lines (${row.unmatched} not matched)`}
              </Button>
            }
          >
            {open === row.id && <StatementLines id={row.id} canEdit={accountant} />}
          </Panel>
        ))}
      </div>
    </MoneySection>
  );
}

function StatementLines({ id, canEdit }: { id: number; canEdit: boolean }) {
  const { data, error, setData } = useLoad<Line[]>(`${API}/statements/${id}`);
  const rows = data ?? [];
  return (
    <>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No lines." />
      {rows.length > 0 && (
        <Table
          caption="Statement lines"
          head={["Date", "Amount", "Reference", "Status", ""]}
          rows={rows.map((line) => [
            when(line.date),
            <Money key="a" value={line.amount} />,
            line.reference || line.description,
            line.payment ? `Matched ${line.payment}` : words(line.status),
            canEdit && line.status === "UNMATCHED" ? (
              <ActButton
                key="i"
                label="Ignore"
                path={`${API}/statement-lines/${line.id}`}
                method="patch"
                body={{ status: "IGNORED" }}
                onDone={() => setData(rows.map((each) => (each.id === line.id ? { ...each, status: "IGNORED" } : each)))}
              />
            ) : null,
          ])}
        />
      )}
    </>
  );
}

function UploadStatement({ onDone }: { onDone: () => void }) {
  const [source, setSource] = useState("MOMO");
  const [file, setFile] = useState<File | null>(null);
  const { error, attempt, busy, run, fail } = useSubmit();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return fail(CHECK_FORM, { file: "Choose the CSV file." });
    const form = new FormData();
    form.append("source", source);
    form.append("file", file);
    void run(async () => {
      await postForm(`${API}/statements`, form);
      onDone();
    });
  }
  return (
    <Panel title="Upload a statement">
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <FormAlert message={error} focusKey={attempt} />
        <p className="text-sm text-ink-muted">A CSV file with date (YYYY-MM-DD), amount, reference and description columns.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            From
            <select value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 block min-h-11 w-full rounded-control border border-line bg-card px-3">
              <option value="MOMO">Mobile Money</option>
              <option value="PAYSTACK">Paystack</option>
              <option value="BANK">Bank</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            File
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block min-h-11 w-full" />
          </label>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </form>
    </Panel>
  );
}

type Account = {
  student: { id: number; name: string; student_id: string };
  balances: Record<string, number>;
  entries: { id: number; account: string; kind: string; amount: number; description: string; created_at: string }[];
  invoices: Invoice[];
};

export function PupilAccountScreen() {
  const id = Number(useSearchParams().get("id")) || 0;
  const { data, error, reload } = useLoad<Account>(`${API}/pupils/${id}`);
  const leader = useRoleIs(HEAD_TEACHER, PROPRIETOR);
  return (
    <MoneySection title={data ? data.student.name : "Pupil's account"} intro="Every charge, payment and correction, newest first.">
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Fees owed" value={<Money value={data.balances.FEES} />} />
            <Stat label="Wallet" value={<Money value={data.balances.WALLET} />} />
            <Stat label="Bookshop" value={<Money value={data.balances.BOOKS} />} />
            <Stat label="Uniforms" value={<Money value={data.balances.UNIFORM} />} />
          </dl>
          <Table
            caption="Account entries"
            head={["When", "Account", "What", "Amount"]}
            rows={data.entries.map((entry) => [when(entry.created_at), words(entry.account), entry.description, <Money key="a" value={entry.amount} />])}
          />
          {leader && (
            <Panel title="Correct the account">
              <RecordForm
                idPrefix="adjust"
                submitLabel="Record correction"
                fields={[
                  { name: "account", label: "Account", type: "choice", required: true, choices: [["FEES", "School fees"], ["WALLET", "Wallet"]] },
                  { name: "amount", label: "Amount", type: "money", required: true, hint: "Positive adds to what is owed (fees) or held (wallet); negative takes away" },
                  { name: "reason", label: "Reason", required: true },
                ]}
                send={(body) => postJson<Row>(`${API}/pupils/${id}/adjust`, body)}
                onSaved={reload}
              />
            </Panel>
          )}
        </div>
      )}
    </MoneySection>
  );
}
