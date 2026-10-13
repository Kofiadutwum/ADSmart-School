"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/portal/auth-provider";
import { InputField, LoadState, useAction, useLoad } from "@/components/portal/kit";
import { RecordForm, RecordsView, type Row } from "@/components/portal/records-view";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { deleteJson, patchJson, postJson, putJson } from "@/lib/client-api";
import { ghs, toPesewas } from "@/lib/money";
import { CONTENT, OWNER, SUPPORT, canUse } from "@/lib/platform-roles";
import { ActButton, Money, Panel, Section, Stat, Table, when, words } from "./common";
import { Conversation, NoticesEditor } from "./school";

const API = "/api/platform";

function useTeam(...roles: string[]): boolean {
  const { me } = useAuth();
  return canUse(me, roles);
}

// ---- Billing -------------------------------------------------------------------------------

export const BILLING_TABS = [
  ["/billing", "Overview"],
  ["/billing/bills", "Bills"],
  ["/billing/payments", "Payments"],
  ["/billing/schools", "Schools"],
  ["/billing/plans", "Plans"],
  ["/billing/groups", "Groups"],
  ["/billing/settings", "Settings"],
] as const;

type Overview = {
  collected_month: number;
  collected_term: number;
  collected_year: number;
  outstanding: number;
  overdue: number;
  overdue_schools: number;
  expected_30_days: number;
  as_of: string;
};

export function BillingOverviewScreen() {
  const { data, error, reload } = useLoad<Overview>(`${API}/billing/overview`);
  const [ran, setRan] = useState<string | null>(null);
  return (
    <Section title="Billing" intro="Money from schools: plans, yearly bills and payments." tabs={BILLING_TABS}>
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Collected this month" value={<Money value={data.collected_month} />} />
            <Stat label="This year" value={<Money value={data.collected_year} />} />
            <Stat label="Outstanding" value={<Money value={data.outstanding} />} />
            <Stat label="Overdue" value={<Money value={data.overdue} />} note={`${data.overdue_schools} schools`} />
            <Stat label="Expected in 30 days" value={<Money value={data.expected_30_days} />} />
          </dl>
          <p className="mt-2 text-sm text-ink-muted">As of {when(data.as_of)}</p>
        </>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <ActButton
          label="Make due bills and send reminders now"
          path={`${API}/billing/run`}
          onDone={(r) => {
            const result = r as { bills: number; reminders: number; paused: number };
            setRan(`${result.bills} bills made, ${result.reminders} reminders sent, ${result.paused} schools paused.`);
            reload();
          }}
        />
        {["bills", "payments", "outstanding"].map((file) => (
          <a key={file} href={`${API}/billing/export/${file}.csv`} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 font-semibold hover:bg-ink/5">
            {words(file)} (CSV)
          </a>
        ))}
      </div>
      {ran && <p role="status" className="mt-3">{ran}</p>}
    </Section>
  );
}

type Bill = { id: number; number: string; school: string; group: string; amount: number; paid: number; due: number; state: string; issued_on: string; due_on: string };

export function BillsScreen() {
  const [state, setState] = useState("");
  const { data, error, reload } = useLoad<Bill[]>(`${API}/billing/bills${state ? `?state=${state}` : ""}`);
  const rows = data ?? [];
  return (
    <Section title="Bills" tabs={BILLING_TABS}>
      <OneOffBill onDone={reload} />
      <label className="my-6 block max-w-xs text-sm font-medium">
        Show
        <select value={state} onChange={(e) => setState(e.target.value)} className={`${inputClasses} mt-1 min-h-11 py-2`}>
          <option value="">All bills</option>
          <option value="OPEN">Open</option>
          <option value="PART_PAID">Part-paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </label>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No bills." />
      {rows.length > 0 && (
        <Table
          caption="Bills"
          head={["Bill", "School or group", "Due", "Amount", "Paid", "Status"]}
          rows={rows.map((bill) => [
            <Link key="b" href={`/billing/bill?id=${bill.id}`} className="font-semibold underline">
              {bill.number}
            </Link>,
            bill.school || bill.group,
            when(bill.due_on),
            <Money key="a" value={bill.amount} />,
            <Money key="p" value={bill.paid} />,
            words(bill.state),
          ])}
        />
      )}
    </Section>
  );
}

function OneOffBill({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [school, setSchool] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const { act, busy, alert } = useAction();
  if (!open) {
    return <Button onClick={() => setOpen(true)}>Make a one-off bill</Button>;
  }
  return (
    <Panel title="One-off bill">
      <div className="grid gap-4 sm:grid-cols-3">
        <InputField id="bill-school" label="School address name (slug)" value={school} onChange={setSchool} required />
        <InputField id="bill-description" label="What it's for" value={description} onChange={setDescription} required />
        <InputField id="bill-amount" label="Amount (GH₵)" value={amount} onChange={setAmount} required />
      </div>
      <span className="flex gap-3">
        <Button
          disabled={busy || toPesewas(amount) === null}
          onClick={() =>
            void act(async () => {
              await postJson(`${API}/billing/bills`, { school, lines: [{ description, amount: toPesewas(amount) }] });
              setOpen(false);
              onDone();
            })
          }
        >
          Make bill
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </span>
      {alert}
    </Panel>
  );
}

type BillDetail = Bill & {
  period_start: string;
  period_end: string;
  cancel_reason: string;
  lines: { description: string; amount: number }[];
  payments: { id: number; amount: number; method: string; reference: string; received_on: string }[];
  adjustments: { kind: string; amount: number; reason: string; created_at: string }[];
  business: { name: string; address: string; tax_number: string; bank_details: string; momo_details: string };
};

export function BillScreen() {
  const id = Number(useSearchParams().get("id")) || 0;
  const { data, setData, error } = useLoad<BillDetail>(`${API}/billing/bills/${id}`);
  const owner = useTeam(OWNER);
  const [reason, setReason] = useState("");
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <Section title={`Bill ${data.number}`} tabs={BILLING_TABS}>
      <div className="space-y-6">
        <article className="rounded-card border border-line bg-card p-6">
          <h2 className="text-xl font-semibold">{data.business.name}</h2>
          {data.business.address && <p className="text-sm">{data.business.address}</p>}
          {data.business.tax_number && <p className="text-sm">Tax number {data.business.tax_number}</p>}
          <p className="mt-4">
            To <strong>{data.school || data.group}</strong> · issued {when(data.issued_on)} · due {when(data.due_on)} · {words(data.state)}
          </p>
          <Table caption="Lines" head={["Item", "Amount"]} rows={[...data.lines.map((l) => [l.description, ghs(l.amount)]), ["Total", ghs(data.amount)]]} />
          {(data.business.momo_details || data.business.bank_details) && (
            <p className="mt-3 text-sm">
              Pay by {[data.business.momo_details && `MoMo: ${data.business.momo_details}`, data.business.bank_details && `bank: ${data.business.bank_details}`].filter(Boolean).join("; ")}
            </p>
          )}
          <Button className="mt-4 print:hidden" onClick={() => window.print()}>
            Print
          </Button>
        </article>
        {data.state !== "CANCELLED" && (
          <Panel title="Record a payment">
            <RecordForm
              idPrefix="bill-payment"
              submitLabel="Record payment"
              fields={[
                { name: "amount", label: "Amount", type: "money", required: true },
                { name: "method", label: "How", type: "choice", required: true, choices: [["MOMO", "Mobile Money"], ["BANK", "Bank transfer"], ["CASH", "Cash"], ["CHEQUE", "Cheque"]] },
                { name: "reference", label: "Payer's reference" },
                { name: "received_on", label: "Received on", type: "date" },
              ]}
              send={(body) => postJson<Row>(`${API}/billing/bills/${id}/payments`, body)}
              onSaved={(row) => setData(row as unknown as BillDetail)}
            />
          </Panel>
        )}
        <Panel title="Credits, reversals and refunds">
          <RecordForm
            idPrefix="bill-adjust"
            submitLabel="Record"
            fields={[
              {
                name: "kind",
                label: "Kind",
                type: "choice",
                required: true,
                choices: [["CREDIT", "Credit"], ["REVERSAL", "Payment reversed"], ...(owner ? ([["REFUND", "Refund"]] as const) : [])],
              },
              { name: "amount", label: "Amount", type: "money", required: true },
              { name: "reason", label: "Reason", required: true },
            ]}
            send={(body) => postJson<Row>(`${API}/billing/bills/${id}/adjustments`, body)}
            onSaved={(row) => setData(row as unknown as BillDetail)}
          />
          {data.adjustments.length > 0 && (
            <Table caption="Adjustments" head={["When", "Kind", "Amount", "Reason"]} rows={data.adjustments.map((a) => [when(a.created_at), words(a.kind), ghs(a.amount), a.reason])} />
          )}
        </Panel>
        {data.payments.length > 0 && (
          <Table caption="Payments" head={["Received", "Amount", "How", "Reference"]} rows={data.payments.map((p) => [when(p.received_on), ghs(p.amount), words(p.method), p.reference])} />
        )}
        {data.paid === 0 && data.state !== "CANCELLED" && (
          <Panel title="Cancel the bill">
            <InputField id="cancel-reason" label="Reason" value={reason} onChange={setReason} required />
            <ActButton label="Cancel bill" confirm="Cancel it? It keeps its number." path={`${API}/billing/bills/${id}`} body={{ reason }} onDone={(r) => setData(r as BillDetail)} />
          </Panel>
        )}
      </div>
    </Section>
  );
}

export function BillPaymentsScreen() {
  const { data, error } = useLoad<{ id: number; bill: string; amount: number; method: string; reference: string; received_on: string }[]>(`${API}/billing/payments`);
  const rows = data ?? [];
  return (
    <Section title="Payments" tabs={BILLING_TABS}>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No payments yet." />
      {rows.length > 0 && (
        <Table caption="Payments" head={["Received", "Bill", "Amount", "How", "Reference"]} rows={rows.map((p) => [when(p.received_on), p.bill, ghs(p.amount), words(p.method), p.reference])} />
      )}
    </Section>
  );
}

type Subscription = {
  slug: string;
  name: string;
  plan: string;
  plan_id: number | null;
  price: number;
  status: string;
  next_bill_on: string | null;
  group: string;
  billing_paused: boolean;
};

export function SubscriptionsScreen() {
  const { data, error } = useLoad<Subscription[]>(`${API}/billing/subscriptions`);
  const rows = data ?? [];
  return (
    <Section title="Schools' plans" tabs={BILLING_TABS}>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No schools yet." />
      {rows.length > 0 && (
        <Table
          caption="Schools' plans"
          head={["School", "Plan", "Price a year", "Status", "Next bill"]}
          rows={rows.map((row) => [
            <Link key="s" href={`/billing/school?slug=${row.slug}`} className="font-semibold underline">
              {row.name}
            </Link>,
            row.plan || "Not set up",
            row.plan ? <Money key="p" value={row.price} /> : "—",
            row.billing_paused ? "Paused for non-payment" : words(row.status),
            row.next_bill_on ? when(row.next_bill_on) : "—",
          ])}
        />
      )}
    </Section>
  );
}

export function SubscriptionScreen() {
  const slug = useSearchParams().get("slug") ?? "";
  const { data, error, setData } = useLoad<Subscription & { bills: Bill[]; discount_percent: number; discount_amount: number; discount_reason: string; reminders_off: boolean; group_id: number | null }>(
    `${API}/billing/subscriptions/${encodeURIComponent(slug)}`,
  );
  const plans = useLoad<{ id: number; name: string; yearly_price: number; active: boolean }[]>(`${API}/billing/plans`);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <Section title={data.name} tabs={BILLING_TABS}>
      <div className="space-y-6">
        <Panel title="Plan">
          <RecordForm
            idPrefix="subscription"
            submitLabel="Save"
            row={{ id: 0, plan: data.plan_id, discount_percent: data.discount_percent, discount_amount: data.discount_amount, discount_reason: data.discount_reason, reminders_off: data.reminders_off }}
            fields={[
              {
                name: "plan",
                label: "Plan",
                type: "choice",
                required: true,
                choices: (plans.data ?? []).map((p) => [String(p.id), `${p.name} (${ghs(p.yearly_price)} a year)`] as const),
              },
              { name: "discount_percent", label: "Standing discount (%)", type: "number" },
              { name: "discount_amount", label: "or a fixed discount", type: "money" },
              { name: "discount_reason", label: "Why" },
              { name: "reminders_off", label: "Don't send reminders", type: "boolean" },
            ]}
            send={(body) => putJson<Row>(`${API}/billing/subscriptions/${encodeURIComponent(slug)}`, { ...body, plan: Number(body.plan) })}
            onSaved={(row) => setData(row as unknown as typeof data)}
          />
          <p className="text-sm text-ink-muted">A new plan takes effect from the next bill. Its price is kept for this school even if the plan&apos;s price changes later.</p>
        </Panel>
        {data.bills.length > 0 && (
          <Table
            caption="Bills"
            head={["Bill", "Due", "Amount", "Status"]}
            rows={data.bills.map((bill) => [
              <Link key="b" href={`/billing/bill?id=${bill.id}`} className="underline">
                {bill.number}
              </Link>,
              when(bill.due_on),
              ghs(bill.amount),
              words(bill.state),
            ])}
          />
        )}
      </div>
    </Section>
  );
}

export function PlansScreen() {
  return (
    <Section title="Plans" intro="Prices shown on your website. A switched-off plan can't be given to new schools." tabs={BILLING_TABS}>
      <RecordsView
        path={`${API}/billing/plans`}
        noun="plan"
        fields={[
          { name: "name", label: "Name", required: true },
          { name: "code", label: "Short code", required: true },
          { name: "yearly_price", label: "Price a year", type: "money", required: true },
          { name: "from_price", label: 'Show as "From" (price agreed per customer)', type: "boolean" },
          { name: "audience", label: "Who it's for" },
          { name: "includes", label: "What's included (one per line)", type: "textarea" },
          { name: "trial_days", label: "Free trial (days)", type: "number" },
          { name: "order", label: "Order", type: "number" },
          { name: "show_on_website", label: "Show on the website", type: "boolean" },
          { name: "active", label: "Active", type: "boolean" },
        ]}
        canAdd
        canEdit
      />
    </Section>
  );
}

export function GroupsScreen() {
  return (
    <Section title="School groups" intro="Several campuses with one bill a year. Set a school's group on its plan page." tabs={BILLING_TABS}>
      <RecordsView
        path={`${API}/billing/groups`}
        noun="group"
        fields={[
          { name: "name", label: "Name", required: true },
          { name: "contact_email", label: "Billing email" },
          { name: "contact_phone", label: "Billing phone" },
        ]}
        canAdd
        canEdit
        canDelete
      />
    </Section>
  );
}

export function BillingSettingsScreen() {
  const owner = useTeam(OWNER);
  const { data, error, setData } = useLoad<Row>(`${API}/billing/settings`);
  return (
    <Section title="Finance settings" intro="Only the Owner can change these." tabs={BILLING_TABS}>
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <RecordForm
          idPrefix="billing-settings"
          submitLabel={owner ? "Save settings" : "Only the Owner can save"}
          row={{ ...data, id: 0 }}
          fields={[
            { name: "business_name", label: "Business name", required: true },
            { name: "business_address", label: "Address" },
            { name: "tax_number", label: "Tax number" },
            { name: "momo_details", label: "MoMo number and name" },
            { name: "bank_details", label: "Bank details" },
            { name: "bill_days_before", label: "Make bills this many days before the billing date", type: "number" },
            { name: "trial_days", label: "Default free trial (days)", type: "number" },
            { name: "reminder_days", label: "Reminder interval (days)", type: "number" },
            { name: "pause_for_non_payment", label: "Pause schools that don't pay", type: "boolean" },
            { name: "grace_days", label: "Pause this many days after the due date", type: "number" },
          ]}
          send={(body) => patchJson<Row>(`${API}/billing/settings`, body)}
          onSaved={setData}
        />
      )}
    </Section>
  );
}

// ---- Statistics ----------------------------------------------------------------------------

type Stats = {
  as_of: string;
  schools: { total: number; by_status: Record<string, number>; new_per_month: { month: string; count: number }[] };
  join_requests: { total: number; by_status: Record<string, number> };
  sizes: { name: string; pupils: number; staff: number; parents: number; signed_in_30_days: number; quiet: boolean }[];
  support: { open: number; average_hours_to_first_reply: number | null };
  website: { visits: number; top_pages: [string, number][]; join_requests_per_100_visits: number | null };
  money?: Overview;
};

export function StatisticsScreen() {
  const [period, setPeriod] = useState("");
  const { data, error } = useLoad<Stats>(`${API}/statistics${period ? `?period=${period}` : ""}`);
  return (
    <Section title="Statistics" intro="Real numbers only; demo records are never counted.">
      <label className="mb-6 block max-w-xs text-sm font-medium">
        Period
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inputClasses} mt-1 min-h-11 py-2`}>
          <option value="">All time</option>
          <option value="month">This month</option>
          <option value="quarter">Last 3 months</option>
          <option value="year">This year</option>
        </select>
      </label>
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <div className="space-y-8">
          <p className="text-sm text-ink-muted">As of {when(data.as_of)}</p>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Schools" value={data.schools.total} />
            <Stat label="Join requests" value={data.join_requests.total} />
            <Stat label="Open support conversations" value={data.support.open} />
            <Stat label="Website visits" value={data.website.visits} />
            {data.money && <Stat label="Outstanding" value={<Money value={data.money.outstanding} />} />}
          </dl>
          <Panel title="New schools per month">
            <Table caption="New schools per month" head={["Month", "Schools"]} rows={data.schools.new_per_month.map((row) => [new Date(row.month).toLocaleDateString("en-GB", { month: "long", year: "numeric" }), row.count])} />
          </Panel>
          <Panel title="School sizes and real use">
            <Table
              caption="School sizes"
              head={["School", "Pupils", "Staff", "Parents", "Signed in (30 days)"]}
              rows={data.sizes.map((row) => [row.name, row.pupils, row.staff, row.parents, row.quiet ? "Quiet: no sign-ins" : row.signed_in_30_days])}
            />
          </Panel>
          {data.website.top_pages.length > 0 && (
            <Panel title="Most visited pages">
              <Table caption="Most visited pages" head={["Page", "Visits"]} rows={data.website.top_pages.map(([page, count]) => [page, count])} />
            </Panel>
          )}
        </div>
      )}
    </Section>
  );
}

// ---- Support, announcements and texts ------------------------------------------------------

type Thread = { id: number; school: string; subject: string; status: string; updated_at: string };

export function PlatformSupportScreen() {
  const [status, setStatus] = useState("OPEN");
  const { data, error } = useLoad<Thread[]>(`${API}/support/threads${status ? `?status=${status}` : ""}`);
  const [open, setOpen] = useState<number | null>(null);
  const rows = data ?? [];
  return (
    <Section title="Support" intro="Questions from schools.">
      <label className="mb-6 block max-w-xs text-sm font-medium">
        Show
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClasses} mt-1 min-h-11 py-2`}>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="">All</option>
        </select>
      </label>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No conversations." />
      <ul className="space-y-4">
        {rows.map((thread) => (
          <li key={thread.id}>
            <Panel
              title={`${thread.school}: ${thread.subject}`}
              actions={
                <Button variant="outline" onClick={() => setOpen(open === thread.id ? null : thread.id)}>
                  {open === thread.id ? "Hide" : "Open"}
                </Button>
              }
            >
              <p className="text-sm text-ink-muted">Updated {when(thread.updated_at)}</p>
              {open === thread.id && <Conversation path={`${API}/support/threads/${thread.id}`} />}
            </Panel>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function PlatformAnnouncementsScreen() {
  return (
    <Section title="Announcements" intro="News for every school's staff, shown in their portal.">
      <RecordsView
        path={`${API}/announcements`}
        noun="announcement"
        fields={[
          { name: "title", label: "Title", required: true },
          { name: "body", label: "Message", type: "textarea", required: true },
          { name: "published", label: "Published", type: "boolean", readOnly: true },
        ]}
        canAdd
        canEdit
        canDelete
        actions={(row, replace) => (
          <ActButton label={row.published ? "Unpublish" : "Publish"} path={`${API}/announcements/${row.id}/publish`} onDone={(r) => replace(r as Row)} />
        )}
      />
    </Section>
  );
}

type SmsRow = { slug: string; name: string; texts: number; texts_this_month: number; failed: number; credits: number };

export function SmsScreen() {
  const { data, error, reload } = useLoad<SmsRow[]>(`${API}/sms`);
  const rows = data ?? [];
  return (
    <Section title="Texts" intro="Texts sent per school and their credits. Schools buy credits from you; add them here once paid.">
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No schools yet." />
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.slug}>
            <Panel title={row.name} actions={<span className="text-sm">{row.credits} credits left</span>}>
              <p className="text-sm">
                {row.texts} texts in all, {row.texts_this_month} in the last 30 days, {row.failed} failed.
              </p>
              <TopUp slug={row.slug} onDone={reload} />
            </Panel>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function TopUp({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [credits, setCredits] = useState("");
  const [reason, setReason] = useState("");
  const { act, busy, alert } = useAction();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <InputField id={`credits-${slug}`} label="Credits to add" value={credits} onChange={setCredits} />
      <InputField id={`reason-${slug}`} label="Reason, e.g. paid by MoMo" value={reason} onChange={setReason} />
      <Button
        disabled={busy || !Number(credits) || !reason.trim()}
        onClick={() =>
          void act(async () => {
            await postJson(`${API}/schools/${slug}/sms-credits`, { credits: Number(credits), reason });
            setCredits("");
            setReason("");
            onDone();
          })
        }
      >
        Add credits
      </Button>
      {alert}
    </div>
  );
}

// ---- One school: web addresses and records under support access ----------------------------

type Domain = { id: number; domain: string; verified_at: string | null; is_primary: boolean; txt_name: string; txt_value: string };

export function SchoolExtras({ slug }: { slug: string }) {
  const support = useTeam(SUPPORT);
  if (!support) return null;
  return (
    <div className="mt-10 space-y-8">
      <Domains slug={slug} />
      <SchoolRecords slug={slug} />
    </div>
  );
}

function Domains({ slug }: { slug: string }) {
  const { data, error, reload } = useLoad<Domain[]>(`${API}/schools/${slug}/domains`);
  const [domain, setDomain] = useState("");
  const { act, busy, alert } = useAction();
  const rows = data ?? [];
  return (
    <Panel title="Own web addresses">
      <p className="text-sm text-ink-muted">
        The school adds a TXT record at its domain; once checked, the address can become the main one.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <InputField id="new-domain" label="Address, e.g. myschool.edu.gh" value={domain} onChange={setDomain} />
        <Button
          disabled={busy || !domain.trim()}
          onClick={() =>
            void act(async () => {
              await postJson(`${API}/schools/${slug}/domains`, { domain: domain.trim().toLowerCase() });
              setDomain("");
              reload();
            })
          }
        >
          Add address
        </Button>
      </div>
      {alert}
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No own addresses." />
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-control border border-line p-3">
            <p className="font-semibold">
              {row.domain} {row.is_primary && "· main address"} {row.verified_at ? "· checked" : "· not checked yet"}
            </p>
            {!row.verified_at && (
              <p className="text-sm break-all">
                TXT record name <code>{row.txt_name}</code>, value <code>{row.txt_value}</code>
              </p>
            )}
            <span className="mt-2 flex flex-wrap gap-2">
              {!row.verified_at && <ActButton label="Check now" path={`${API}/schools/${slug}/domains/${row.id}`} body={{ action: "check" }} onDone={reload} />}
              {row.verified_at && !row.is_primary && (
                <ActButton label="Make main address" path={`${API}/schools/${slug}/domains/${row.id}`} body={{ action: "primary" }} onDone={reload} />
              )}
              <Button variant="outline" disabled={busy} onClick={() => void act(async () => { await deleteJson(`${API}/schools/${slug}/domains/${row.id}`); reload(); })}>
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function SchoolRecords({ slug }: { slug: string }) {
  const [kind, setKind] = useState<"" | "pupils" | "staff" | "parents">("");
  return (
    <Panel title="School records (support access)">
      <p className="text-sm text-ink-muted">Only while the school&apos;s Administrator has switched on support access. Every look is logged.</p>
      <span className="flex flex-wrap gap-2">
        {(["pupils", "staff", "parents"] as const).map((each) => (
          <Button key={each} variant={kind === each ? "primary" : "outline"} onClick={() => setKind(each)}>
            {words(each)}
          </Button>
        ))}
      </span>
      {kind && <RecordList key={kind} path={`${API}/schools/${slug}/records/${kind}`} />}
    </Panel>
  );
}

function RecordList({ path }: { path: string }) {
  const { data, error } = useLoad<{ ends_at: string; rows: Record<string, unknown>[] }>(path);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  const columns = Object.keys(data.rows[0] ?? {}).filter((key) => key !== "id");
  return (
    <>
      <p className="text-sm">Access ends {when(data.ends_at)}.</p>
      <Table caption="Records" head={columns.map(words)} rows={data.rows.map((row) => columns.map((key) => String(row[key] ?? "—")))} />
    </>
  );
}

export function PlatformPrivacyScreen() {
  const content = useTeam(CONTENT);
  return (
    <Section title="Privacy notice" intro="ADsmartschool's own privacy notice for its website.">
      <NoticesEditor path={`${API}/website/notices`} canEdit={content} />
    </Section>
  );
}

