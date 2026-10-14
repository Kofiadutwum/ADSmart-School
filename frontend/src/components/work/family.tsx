"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CHECK_FORM, InputField, LoadState, useAction, useLoad, useSubmit } from "@/components/portal/kit";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { getJson, postJson } from "@/lib/client-api";
import { ghs, toPesewas } from "@/lib/money";
import { ActButton, Money, PageHead, Panel, Stat, Table, today, when, words } from "./common";
import { ReportCardView, ResourceCard, type ReportCard } from "./learning";

const API = "/api/parent";

type Ward = { id: number; first_name: string; name: string; class: string | null };

/** Choose which child a page is about; one child is chosen straight away. */
function WardPicker({ children }: { children: (ward: Ward) => ReactNode }) {
  const { data, error } = useLoad<Ward[]>(`${API}/wards`);
  const [chosen, setChosen] = useState<number | null>(null);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  if (data.length === 0) return <p>No children are linked to your account yet. Please contact the school.</p>;
  const ward = data.find((each) => each.id === chosen) ?? data[0];
  return (
    <div className="space-y-6">
      {data.length > 1 && (
        <div role="group" aria-label="Choose a child" className="flex flex-wrap gap-2">
          {data.map((each) => (
            <button
              key={each.id}
              type="button"
              aria-pressed={each.id === ward.id}
              onClick={() => setChosen(each.id)}
              className={`min-h-11 rounded-full border px-4 font-semibold ${each.id === ward.id ? "border-ink bg-ink/10" : "border-line"}`}
            >
              {each.first_name}
            </button>
          ))}
        </div>
      )}
      <div key={ward.id}>{children(ward)}</div>
    </div>
  );
}

type Money_ = {
  fees_owed: number;
  wallet: number;
  online_payment: boolean;
  invoices: {
    id: number;
    number: string;
    term: string;
    total: number;
    arrears: number;
    due_on: string;
    status: string;
    lines: { description: string; amount: number }[];
    instalments: { due_on: string; amount: number; outstanding: number }[];
  }[];
  receipts: { id: number; receipt_number: string; amount: number; method: string; purpose: string; received_at: string; status: string }[];
};

export function ParentPaymentsScreen() {
  return (
    <div>
      <PageHead title="Payments" intro="Fees, the wallet for daily charges, and your receipts." />
      <WardPicker>{(ward) => <WardMoney ward={ward} />}</WardPicker>
    </div>
  );
}

function WardMoney({ ward }: { ward: Ward }) {
  const { data, error } = useLoad<Money_>(`${API}/wards/${ward.id}/money`);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-4">
        <Stat label="School fees owed" value={<Money value={Math.max(data.fees_owed, 0)} />} note={data.fees_owed < 0 ? `In credit by ${ghs(-data.fees_owed)}` : undefined} />
        <Stat label="Wallet" value={<Money value={data.wallet} />} note={data.wallet < 0 ? "Daily charges are owed" : undefined} />
      </dl>
      {data.online_payment ? <PayNow ward={ward} owed={data.fees_owed} /> : <p className="text-ink-muted">Online payment isn&apos;t set up yet. Please pay at the school.</p>}
      {data.invoices.map((invoice) => (
        <Panel key={invoice.id} title={`${invoice.term} · ${invoice.number}`} actions={<span className="text-sm">{words(invoice.status)}</span>}>
          <Table
            caption={`Invoice ${invoice.number}`}
            head={["Item", "Amount"]}
            rows={[...invoice.lines.map((line) => [line.description, ghs(line.amount)]), ["Total for the term", ghs(invoice.total)]]}
          />
          <p className="text-sm">Due {when(invoice.due_on)}</p>
          {invoice.instalments.length > 0 && (
            <Table
              caption="Instalments"
              head={["Due", "Amount", "Still to pay"]}
              rows={invoice.instalments.map((item) => [when(item.due_on), ghs(item.amount), ghs(item.outstanding)])}
            />
          )}
        </Panel>
      ))}
      {data.receipts.length > 0 && (
        <Panel title="Receipts">
          <Table
            caption="Receipts"
            head={["Receipt", "Date", "Amount", "For"]}
            rows={data.receipts.map((r) => [
              <Link key="r" href={`/payments/receipt?id=${r.id}`} className="underline">
                {r.receipt_number}
              </Link>,
              when(r.received_at),
              ghs(r.amount),
              r.status === "REVERSED" ? "Reversed" : r.purpose,
            ])}
          />
        </Panel>
      )}
    </div>
  );
}

function PayNow({ ward, owed }: { ward: Ward; owed: number }) {
  const [amount, setAmount] = useState(owed > 0 ? (owed / 100).toFixed(2) : "");
  const [purpose, setPurpose] = useState("FEES");
  const { error, errors, attempt, busy, run, fail } = useSubmit();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pesewas = toPesewas(amount);
    if (!pesewas || pesewas < 100) return fail(CHECK_FORM, { amount: "Enter at least GH₵1.00." });
    void run(async () => {
      const answer = await postJson<{ authorization_url: string }>(`${API}/pay`, { student: ward.id, amount: pesewas, purpose });
      window.location.assign(answer.authorization_url);
    });
  }
  return (
    <Panel title={`Pay for ${ward.first_name}`}>
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <FormAlert message={error} focusKey={attempt} />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField id="pay-amount" label="Amount (GH₵)" value={amount} onChange={setAmount} required error={errors.amount} />
          <label className="block font-medium">
            For
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={`${inputClasses} mt-2`}>
              <option value="FEES">School fees</option>
              <option value="WALLET">Top up the wallet</option>
            </select>
          </label>
        </div>
        <p className="text-sm text-ink-muted">You&apos;ll pay on Paystack&apos;s secure page by Mobile Money or card. Your details never reach the school.</p>
        <Button type="submit" disabled={busy}>
          {busy ? "Opening Paystack…" : "Pay now"}
        </Button>
      </form>
    </Panel>
  );
}

export function PaymentDoneScreen() {
  const params = useSearchParams();
  const reference = params.get("reference") ?? params.get("trxref") ?? "";
  const [state, setState] = useState<{ status: string; amount: number; receipt_number: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!reference) return;
    getJson<{ status: string; amount: number; receipt_number: string }>(`${API}/pay/status?reference=${encodeURIComponent(reference)}`).then(
      setState,
      () => setProblem("We couldn't check this payment yet. It will show on the Payments page once it is confirmed."),
    );
  }, [reference]);
  return (
    <div className="max-w-xl space-y-4">
      <PageHead title="Payment" />
      {problem && <p role="alert">{problem}</p>}
      {!state && !problem && <p>Checking your payment with Paystack…</p>}
      {state?.status === "SUCCESS" && (
        <p role="status">
          Thank you. {ghs(state.amount)} was received. Receipt {state.receipt_number}.
        </p>
      )}
      {state?.status === "PENDING" && <p role="status">Your payment is still being confirmed. It will show on the Payments page shortly.</p>}
      {state?.status === "FAILED" && <p role="alert">The payment didn&apos;t go through. Nothing was taken. You can try again.</p>}
      <Link href="/payments" className="font-semibold underline">
        Back to payments
      </Link>
    </div>
  );
}

export function ParentReceiptScreen() {
  const id = Number(useSearchParams().get("id")) || 0;
  const { data, error } = useLoad<{
    receipt_number: string;
    amount: number;
    method: string;
    purpose: string;
    received_at: string;
    pupil: string;
    student_id: string;
    reference: string;
    school: { name: string; phone: string };
  }>(`${API}/receipts/${id}`);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <article className="max-w-xl space-y-3 rounded-card border border-line bg-card p-6">
      <h1 className="text-2xl font-semibold">{data.school.name}</h1>
      <h2 className="text-lg font-semibold">Receipt {data.receipt_number}</h2>
      <p>
        {data.pupil} ({data.student_id}) · {ghs(data.amount)} · {data.method} · {data.purpose} · {when(data.received_at)}
      </p>
      {data.reference && <p>Reference {data.reference}</p>}
      <Button className="print:hidden" onClick={() => window.print()}>
        Print
      </Button>
    </article>
  );
}

const MORE: [string, string, string][] = [
  ["/announcements", "News from the school", "Announcements for parents."],
  ["/learning", "Learning", "Report cards, attendance, the timetable and resources."],
  ["/care", "Daily care and pick-up", "Daily reports, notes to carers, and letting someone else collect your child."],
  ["/school-shop", "Books and uniforms", "Order and pay; collect with a code."],
  ["/bus", "School bus", "Route, stop and pick-up time."],
  ["/my-data", "Your data", "Ask for a copy of your family's information, a correction or deletion."],
  ["/account", "Account", "Your password and signed-in devices."],
];

export function ParentMoreScreen() {
  return (
    <div>
      <PageHead title="More" />
      <ul className="grid gap-4 sm:grid-cols-2">
        {MORE.map(([href, title, text]) => (
          <li key={href}>
            <Link href={href} className="block h-full rounded-card border border-line bg-card p-5 hover:bg-ink/5">
              <span className="font-semibold">{title}</span>
              <span className="mt-1 block text-sm text-ink-muted">{text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ParentNewsScreen() {
  const { data, error } = useLoad<{ id: number; title: string; body: string; sent_at: string }[]>(`${API}/announcements`);
  const rows = data ?? [];
  return (
    <div>
      <PageHead title="News from the school" />
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No announcements yet." />
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.id}>
            <Panel title={row.title}>
              <p className="text-sm text-ink-muted">{when(row.sent_at)}</p>
              <p className="whitespace-pre-line">{row.body}</p>
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ParentLearningScreen() {
  return (
    <div>
      <PageHead title="Learning" />
      <WardPicker>{(ward) => <WardLearning ward={ward} />}</WardPicker>
    </div>
  );
}

function WardLearning({ ward }: { ward: Ward }) {
  const terms = useLoad<{ id: number; name: string }[]>(`${API}/wards/${ward.id}/terms`);
  const [term, setTerm] = useState("");
  const chosen = term || String(terms.data?.[0]?.id ?? "");
  const attendance = useLoad<{ days: number; present: number; late: number; absent: number; rate: number | null }>(`${API}/wards/${ward.id}/attendance`);
  const performance = useLoad<{ term: string; average: number | null }[]>(`${API}/wards/${ward.id}/performance`);
  const resources = useLoad<Parameters<typeof ResourceCard>[0]["item"][]>(`${API}/wards/${ward.id}/resources`);
  const timetable = useLoad<{ day: number; period: string; subject: string; teacher: string }[]>(`${API}/wards/${ward.id}/timetable`);
  return (
    <div className="space-y-8">
      {attendance.data && attendance.data.days > 0 && (
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Days present" value={attendance.data.present + attendance.data.late} note={`of ${attendance.data.days}`} />
          <Stat label="Absent" value={attendance.data.absent} />
          <Stat label="Late" value={attendance.data.late} />
          <Stat label="Attendance" value={attendance.data.rate === null ? "—" : `${attendance.data.rate}%`} />
        </dl>
      )}
      {terms.data && terms.data.length > 0 && (
        <div className="space-y-4">
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
          {chosen && <WardReport key={chosen} ward={ward} term={chosen} />}
        </div>
      )}
      {performance.data && performance.data.length > 1 && (
        <Panel title="Term by term">
          <Table caption="Average by term" head={["Term", "Average"]} rows={performance.data.map((row) => [row.term, row.average ?? "—"])} />
        </Panel>
      )}
      {timetable.data && timetable.data.length > 0 && (
        <Panel title="Timetable">
          <Table
            caption="Timetable"
            head={["Day", "Period", "Subject", "Teacher"]}
            rows={timetable.data.map((s) => [["Mon", "Tue", "Wed", "Thu", "Fri"][s.day - 1], s.period, s.subject, s.teacher])}
          />
        </Panel>
      )}
      {resources.data && resources.data.length > 0 && (
        <Panel title="Resources">
          <ul className="grid gap-4 lg:grid-cols-2">
            {resources.data.map((item) => (
              <li key={item.id}>
                <ResourceCard item={item} filePath={`${API}/resources/${item.id}`} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function WardReport({ ward, term }: { ward: Ward; term: string }) {
  const { data, error } = useLoad<ReportCard>(`${API}/wards/${ward.id}/report-card?term=${term}`);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return <ReportCardView card={data} />;
}

type Care = {
  reports: { date: string; meals: string; ate_well: boolean | null; sleep: string; mood: string; activities: string; incident: string; supplies_needed: string }[];
  notes: { id: number; text: string; from_parent: boolean; approved: boolean; created_at: string }[];
};

export function ParentCareScreen() {
  return (
    <div>
      <PageHead title="Daily care and pick-up" />
      <WardPicker>{(ward) => <WardCare ward={ward} />}</WardPicker>
    </div>
  );
}

function WardCare({ ward }: { ward: Ward }) {
  const care = useLoad<Care>(`${API}/wards/${ward.id}/daily-care`);
  const approvals = useLoad<{ id: number; date: string; name: string }[]>(`${API}/wards/${ward.id}/approvals`);
  const [note, setNote] = useState("");
  const [approval, setApproval] = useState({ date: today(), name: "", phone: "" });
  const { act, busy, alert } = useAction();
  return (
    <div className="space-y-6">
      <Panel title={`Let someone else collect ${ward.first_name}`}>
        <p className="text-sm text-ink-muted">For one day only. They must show the gate staff who they are.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <InputField id="approve-date" type="date" label="Day" value={approval.date} onChange={(date) => setApproval({ ...approval, date })} required />
          <InputField id="approve-name" label="Their full name" value={approval.name} onChange={(name) => setApproval({ ...approval, name })} required />
          <InputField id="approve-phone" type="tel" label="Their phone" value={approval.phone} onChange={(phone) => setApproval({ ...approval, phone })} />
        </div>
        <Button
          disabled={busy || !approval.name.trim()}
          onClick={() =>
            void act(async () => {
              await postJson(`${API}/wards/${ward.id}/approvals`, approval);
              setApproval({ date: today(), name: "", phone: "" });
              approvals.reload();
            })
          }
        >
          Allow
        </Button>
        {approvals.data && approvals.data.length > 0 && (
          <ul className="list-inside list-disc text-sm">
            {approvals.data.map((a) => (
              <li key={a.id}>
                {a.name} on {when(a.date)}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Send a note to the carers">
        <label className="block font-medium">
          Note
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClasses} mt-2 min-h-24`} />
        </label>
        <Button
          disabled={busy || !note.trim()}
          onClick={() =>
            void act(async () => {
              await postJson(`${API}/wards/${ward.id}/notes`, { text: note });
              setNote("");
              care.reload();
            })
          }
        >
          Send note
        </Button>
        {alert}
      </Panel>
      {care.data && care.data.notes.length > 0 && (
        <Panel title="Notes">
          <ul className="space-y-2">
            {care.data.notes.map((n) => (
              <li key={n.id} className={`rounded-control p-3 ${n.from_parent ? "bg-ink/5" : "bg-indigo/10"}`}>
                <p className="text-sm text-ink-muted">
                  {n.from_parent ? "You" : "The carers"} · {when(n.created_at)}
                  {n.from_parent && !n.approved && " · waiting for the class teacher"}
                </p>
                <p>{n.text}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {care.data && care.data.reports.length > 0 && (
        <Panel title="Daily reports">
          <ul className="space-y-3">
            {care.data.reports.map((r) => (
              <li key={r.date} className="rounded-control border border-line p-3">
                <p className="font-semibold">{when(r.date)}</p>
                <p className="text-sm">
                  {[r.meals && `Meals: ${r.meals}${r.ate_well === false ? " (didn't eat well)" : ""}`, r.sleep && `Sleep: ${r.sleep}`, r.mood && `Mood: ${r.mood}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {r.activities && <p className="text-sm">{r.activities}</p>}
                {r.incident && <p className="text-sm font-semibold">{r.incident}</p>}
                {r.supplies_needed && <p className="text-sm">Please send: {r.supplies_needed}</p>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

type Shop = {
  books: { id: number; title: string; price: number; required: boolean; in_stock: boolean }[];
  uniforms: { id: number; name: string; price: number; sizes: string[]; last_size: string }[];
  orders: { id: number; kind: string; status: string; total: number; collection_code: string; lines: { id: number; item: string; size: string; quantity: number }[] }[];
};

export function ParentShopScreen() {
  return (
    <div>
      <PageHead title="Books and uniforms" intro="Order and pay here. When the order is ready you'll get a text with a code to collect it." />
      <WardPicker>{(ward) => <WardShop ward={ward} />}</WardPicker>
    </div>
  );
}

function WardShop({ ward }: { ward: Ward }) {
  const { data, error, reload } = useLoad<Shop>(`${API}/wards/${ward.id}/shop`);
  const [books, setBooks] = useState<Record<number, boolean>>({});
  const [sizes, setSizes] = useState<Record<number, string>>({});
  const { act, busy, alert } = useAction();
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  const chosenBooks = data.books.filter((b) => books[b.id] ?? b.required);
  const order = (kind: string, items: Record<string, unknown>[]) =>
    act(async () => {
      await postJson(`${API}/wards/${ward.id}/orders`, { kind, items });
      reload();
    });
  return (
    <div className="space-y-6">
      {data.books.length > 0 && (
        <Panel title="Books">
          <ul className="space-y-1">
            {data.books.map((book) => (
              <li key={book.id}>
                <label className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" checked={books[book.id] ?? book.required} onChange={(e) => setBooks({ ...books, [book.id]: e.target.checked })} className="size-5 accent-indigo" />
                  {book.title} · {ghs(book.price)}
                  {book.required && <span className="text-sm text-ink-muted">(needed for the class)</span>}
                </label>
              </li>
            ))}
          </ul>
          <Button disabled={busy || chosenBooks.length === 0} onClick={() => void order("BOOKS", chosenBooks.map((b) => ({ book: b.id, quantity: 1 })))}>
            Order {chosenBooks.length} books ({ghs(chosenBooks.reduce((sum, b) => sum + b.price, 0))})
          </Button>
        </Panel>
      )}
      {data.uniforms.length > 0 && (
        <Panel title="Uniforms">
          <ul className="space-y-2">
            {data.uniforms.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3">
                <span className="min-w-40">
                  {item.name} · {ghs(item.price)}
                </span>
                <select
                  aria-label={`Size of ${item.name}`}
                  value={sizes[item.id] ?? ""}
                  onChange={(e) => setSizes({ ...sizes, [item.id]: e.target.value })}
                  className={`${inputClasses} min-h-11 w-40 py-2`}
                >
                  <option value="">Not needed</option>
                  {item.sizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                      {size === item.last_size ? " (last time)" : ""}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <Button
            disabled={busy || !Object.values(sizes).some(Boolean)}
            onClick={() =>
              void order(
                "UNIFORMS",
                Object.entries(sizes)
                  .filter(([, size]) => size)
                  .map(([id, size]) => ({ uniform: Number(id), size, quantity: 1 })),
              )
            }
          >
            Order uniforms
          </Button>
        </Panel>
      )}
      {alert}
      {data.orders.length > 0 && (
        <Panel title="Your orders">
          <ul className="space-y-3">
            {data.orders.map((o) => (
              <li key={o.id} className="rounded-control border border-line p-3">
                <p className="font-semibold">
                  {words(o.kind)} · {ghs(o.total)} · {words(o.status)}
                </p>
                <p className="text-sm">{o.lines.map((l) => `${l.quantity} × ${l.item}${l.size ? ` (${l.size})` : ""}`).join(", ")}</p>
                {["READY", "PART_ISSUED"].includes(o.status) && (
                  <p className="mt-1">
                    Collection code: <strong className="text-lg tracking-widest">{o.collection_code}</strong>
                  </p>
                )}
                {o.status === "AWAITING_PAYMENT" && (
                  <span className="mt-2 flex flex-wrap gap-2">
                    <ActButton label="Pay from the wallet" path={`${API}/orders/${o.id}/pay`} body={{ method: "WALLET" }} onDone={reload} />
                    <ActButton
                      label="Pay online"
                      path={`${API}/orders/${o.id}/pay`}
                      body={{ method: "ONLINE" }}
                      onDone={(r) => window.location.assign((r as { authorization_url: string }).authorization_url)}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

export function ParentBusScreen() {
  return (
    <div>
      <PageHead title="School bus" />
      <WardPicker>{(ward) => <WardBus ward={ward} />}</WardPicker>
    </div>
  );
}

function WardBus({ ward }: { ward: Ward }) {
  const { data, error, reload } = useLoad<{ route: string | null; stop: string | null; pickup_time: string | null; bus: string | null; changes: { id: number; new_stop: string }[] }>(
    `${API}/wards/${ward.id}/bus`,
  );
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <div className="space-y-4">
      {data.route ? (
        <Panel title={`${ward.first_name} rides ${data.route}`}>
          <p>
            Stop: {data.stop}
            {data.pickup_time && ` · pick-up at ${data.pickup_time.slice(0, 5)}`}
            {data.bus && ` · ${data.bus}`}
          </p>
          <p className="text-sm text-ink-muted">You get a text when {ward.first_name} boards and is dropped off.</p>
        </Panel>
      ) : (
        <p>{ward.first_name} isn&apos;t on a bus route.</p>
      )}
      {data.changes.map((change) => (
        <Panel key={change.id} title={`The school asks to move ${ward.first_name} to ${change.new_stop}`}>
          <span className="flex flex-wrap gap-2">
            <ActButton label="Confirm the new stop" path={`${API}/stop-changes/${change.id}`} body={{ confirm: true }} onDone={reload} />
            <ActButton label="Keep the old stop" path={`${API}/stop-changes/${change.id}`} body={{ confirm: false }} onDone={reload} />
          </span>
        </Panel>
      ))}
    </div>
  );
}

export function ParentDataScreen() {
  const { data, error, reload } = useLoad<{ id: number; kind: string; status: string; response: string; created_at: string }[]>(`${API}/data-requests`);
  const [kind, setKind] = useState("COPY");
  const [details, setDetails] = useState("");
  const { act, busy, alert } = useAction();
  return (
    <div className="space-y-6">
      <PageHead title="Your data" intro="Under Ghana's Data Protection Act you can ask for a copy of the information the school holds about your family, ask for a correction, or ask for it to be deleted." />
      <Panel title="Make a request">
        <label className="block max-w-sm font-medium">
          I would like
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${inputClasses} mt-2`}>
            <option value="COPY">A copy of our data</option>
            <option value="CORRECTION">A correction</option>
            <option value="DELETION">Our data deleted</option>
            <option value="OTHER">Something else</option>
          </select>
        </label>
        <label className="block font-medium">
          Details
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} className={`${inputClasses} mt-2 min-h-24`} />
        </label>
        <Button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await postJson(`${API}/data-requests`, { kind, details });
              setDetails("");
              reload();
            })
          }
        >
          Send request
        </Button>
        {alert}
      </Panel>
      <LoadState error={error} loading={!data && !error} empty={(data ?? []).length === 0} emptyText="You haven't made a request." />
      {data && data.length > 0 && (
        <Table caption="Your requests" head={["Asked", "For", "Status", "Answer"]} rows={data.map((r) => [when(r.created_at), words(r.kind), words(r.status), r.response || "—"])} />
      )}
    </div>
  );
}

/** A payment link opened from a text: no sign-in, only the child's first name and the amount. */
export function PayLinkScreen({ token }: { token: string }) {
  const reference = useSearchParams().get("reference");
  return reference ? <PayLinkDone reference={reference} /> : <PayLinkForm token={token} />;
}

/** Back from Paystack: our server asks Paystack before saying the payment went through. */
function PayLinkDone({ reference }: { reference: string }) {
  const { data, error } = useLoad<{ status: string; amount: number; receipt_number: string }>(
    `/api/payments/verify?reference=${encodeURIComponent(reference)}`,
  );
  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <h1 className="text-3xl font-semibold">Payment</h1>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Checking your payment…</p>}
      {data?.status === "SUCCESS" && (
        <p role="status">
          Thank you. {ghs(data.amount)} was received. Receipt {data.receipt_number}.
        </p>
      )}
      {data?.status === "PENDING" && <p role="status">Your payment is still being confirmed.</p>}
      {data?.status === "FAILED" && <p role="alert">The payment didn&apos;t go through. Nothing was taken.</p>}
    </div>
  );
}

function PayLinkForm({ token }: { token: string }) {
  const { data, error } = useLoad<{ school: string; pupil: string; amount: number; purpose: string }>(`/api/public/pay/${encodeURIComponent(token)}`);
  const { act, busy, alert } = useAction();
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <h1 className="text-3xl font-semibold">{data.school}</h1>
      <p className="text-lg">
        Pay <strong>{ghs(data.amount)}</strong> for {data.pupil}&apos;s {data.purpose === "WALLET" ? "wallet" : "school fees"}.
      </p>
      <p className="text-sm text-ink-muted">You&apos;ll pay on Paystack&apos;s secure page by Mobile Money or card.</p>
      <Button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            const answer = await postJson<{ authorization_url: string }>(`/api/public/pay/${encodeURIComponent(token)}`);
            window.location.assign(answer.authorization_url);
          })
        }
      >
        Pay now
      </Button>
      {alert}
    </div>
  );
}
