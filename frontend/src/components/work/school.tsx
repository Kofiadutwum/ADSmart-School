"use client";

import { useState, type FormEvent } from "react";
import { InputField, LoadState, textareaClasses, useAction, useLoad, useSubmit } from "@/components/portal/kit";
import { RecordForm, RecordsView, type Row } from "@/components/portal/records-view";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, patchJson, postForm, postJson } from "@/lib/client-api";
import { ghs } from "@/lib/money";
import { ACCOUNTANT, ADMINISTRATOR, HEAD_TEACHER, PROPRIETOR } from "@/lib/school-roles";
import { ActButton, Money, Panel, Picker, Section, Stat, Table, useRoleIs, when, words } from "./common";

const SCHOOL = "/api/school";

// ---- Messages ------------------------------------------------------------------------------

export const MESSAGE_TABS = [
  ["/messages", "Announcements"],
  ["/messages/wording", "Wording"],
  ["/messages/texts", "Texts and credits"],
] as const;

export function AnnouncementsScreen() {
  return (
    <Section title="Announcements" intro="Shown in the portal at once, and texted when you choose. Texts that aren't essential only go to parents who allow them." tabs={MESSAGE_TABS}>
      <RecordsView
        path={`${SCHOOL}/messages/announcements`}
        noun="announcement"
        fields={[
          { name: "title", label: "Title", required: true },
          { name: "body", label: "Message", type: "textarea", required: true },
          { name: "audience", label: "To", type: "choice", required: true, choices: [["PARENTS", "Parents"], ["STAFF", "Staff"], ["EVERYONE", "Parents and staff"]] },
          { name: "school_class", label: "Only one class's parents", type: "option", options: "classes" },
          { name: "send_sms", label: "Also send by text", type: "boolean" },
          { name: "essential", label: "Essential (school closure, safety)", type: "boolean" },
          { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["DRAFT", "Draft"], ["SENT", "Sent"]] },
          { name: "texts_sent", label: "Texts sent", readOnly: true },
        ]}
        canAdd
        canEdit
        canDelete
        actions={(row, replace) =>
          row.status === "DRAFT" ? (
            <ActButton label="Send" variant="primary" confirm="Send it now?" path={`${SCHOOL}/messages/announcements/${row.id}/send`} onDone={(r) => replace(r as Row)} />
          ) : null
        }
      />
    </Section>
  );
}

export function WordingScreen() {
  const head = useRoleIs(HEAD_TEACHER);
  const defaults = useLoad<{ key: string; body: string }[]>(`${SCHOOL}/messages/templates/defaults`);
  const keys = (defaults.data ?? []).map((row) => [row.key, words(row.key)] as const);
  return (
    <Section title="Wording of automatic texts" intro="Your own wording replaces ours once the Head Teacher approves it. Keep the {placeholders}." tabs={MESSAGE_TABS}>
      <div className="space-y-10">
        <RecordsView
          path={`${SCHOOL}/messages/templates`}
          noun="wording"
          fields={[
            { name: "key", label: "Message", type: "choice", required: true, choices: keys },
            { name: "body", label: "Wording", type: "textarea", required: true },
            { name: "approved", label: "Approved", type: "boolean", readOnly: true },
          ]}
          canAdd
          canEdit
          canDelete
          actions={(row, replace) =>
            head && !row.approved ? (
              <ActButton label="Approve" path={`${SCHOOL}/messages/templates/${row.id}/approve`} onDone={(r) => replace(r as Row)} />
            ) : null
          }
        />
        <Panel title="Our wording">
          <dl className="space-y-3">
            {(defaults.data ?? []).map((row) => (
              <div key={row.key}>
                <dt className="font-semibold">{words(row.key)}</dt>
                <dd className="text-ink-muted">{row.body}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </Section>
  );
}

type Credits = { balance: number; low: boolean; entries: { change: number; reason: string; created_at: string }[] };
type Text = { id: number; to: string; purpose: string; body: string; status: string; error: string; created_at: string };

export function TextsScreen() {
  const credits = useLoad<Credits>(`${SCHOOL}/messages/credits`);
  const log = useLoad<Text[]>(`${SCHOOL}/messages/log`);
  return (
    <Section title="Texts and credits" intro="Each text uses one credit per 160 characters. Sign-in codes are free. Ask ADsmartschool to top up your credits." tabs={MESSAGE_TABS}>
      {credits.data && (
        <dl className="mb-6 grid max-w-md grid-cols-2 gap-4">
          <Stat label="Credits left" value={credits.data.balance} note={credits.data.low ? "Running low" : undefined} />
        </dl>
      )}
      <LoadState error={log.error} loading={!log.data && !log.error} empty={(log.data ?? []).length === 0} emptyText="No texts sent yet." />
      {log.data && log.data.length > 0 && (
        <Table
          caption="Texts"
          head={["When", "To", "What", "Status"]}
          rows={log.data.map((text) => [when(text.created_at), text.to, words(text.purpose), text.error ? `${words(text.status)} (${words(text.error)})` : words(text.status)])}
        />
      )}
    </Section>
  );
}

// ---- Website -------------------------------------------------------------------------------

export const WEBSITE_TABS = [
  ["/website", "Text"],
  ["/website/photos", "Photos"],
  ["/website/news", "News"],
  ["/website/facts", "Facts and features"],
  ["/website/privacy", "Privacy notice"],
  ["/website/live", "Go live"],
] as const;

type Block = { id: number; key: string; text: string; help_text: string; needs_review: boolean };

export function WebsiteTextScreen() {
  const admin = useRoleIs(ADMINISTRATOR);
  const { data, error, setData } = useLoad<Block[]>(`${SCHOOL}/website/blocks`);
  const rows = data ?? [];
  return (
    <Section title="Website text" intro="Every block starts with suggested words marked for review. Read each one and make it your own." tabs={WEBSITE_TABS}>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No text blocks." />
      <ul className="space-y-4">
        {rows.map((block) => (
          <li key={block.id}>
            <BlockEditor block={block} canEdit={admin} onSaved={(row) => setData(rows.map((each) => (each.id === row.id ? row : each)))} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function BlockEditor({ block, canEdit, onSaved }: { block: Block; canEdit: boolean; onSaved: (row: Block) => void }) {
  const [text, setText] = useState(block.text);
  const { act, busy, alert } = useAction();
  return (
    <Panel title={words(block.key)} actions={block.needs_review ? <span className="text-sm font-semibold text-copper">Needs review</span> : null}>
      {block.help_text && <p className="text-sm text-ink-muted">{block.help_text}</p>}
      <textarea aria-label={words(block.key)} value={text} disabled={!canEdit} onChange={(e) => setText(e.target.value)} className={textareaClasses} />
      {canEdit && (
        <Button disabled={busy} onClick={() => void act(async () => onSaved(await patchJson<Block>(`${SCHOOL}/website/blocks/${block.id}`, { text, needs_review: false })))}>
          Save and mark reviewed
        </Button>
      )}
      {alert}
    </Panel>
  );
}

type Photo = { id: number; key: string; alt_text: string; caption: string; is_placeholder: boolean; image: { src?: string } | null };

export function WebsitePhotosScreen() {
  const admin = useRoleIs(ADMINISTRATOR);
  const { data, error, setData } = useLoad<Photo[]>(`${SCHOOL}/website/photos`);
  const rows = data ?? [];
  return (
    <Section title="Photos" intro="Placeholder photos are never shown publicly. Upload your own, with a description for people who can't see it." tabs={WEBSITE_TABS}>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No photo places." />
      <ul className="grid gap-4 lg:grid-cols-2">
        {rows.map((photo) => (
          <li key={photo.id}>
            <PhotoSlot photo={photo} canEdit={admin} onSaved={(row) => setData(rows.map((each) => (each.id === row.id ? row : each)))} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PhotoSlot({ photo, canEdit, onSaved }: { photo: Photo; canEdit: boolean; onSaved: (row: Photo) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState(photo.alt_text);
  const { act, busy, alert } = useAction();
  return (
    <Panel title={words(photo.key)} actions={photo.is_placeholder ? <span className="text-sm text-copper">Placeholder</span> : null}>
      {photo.image?.src && (
        // eslint-disable-next-line @next/next/no-img-element -- WebP renditions from Django
        <img src={photo.image.src} alt={photo.alt_text} className="aspect-video w-full rounded-control object-cover" />
      )}
      {canEdit && (
        <>
          <InputField id={`alt-${photo.id}`} label="Description of the photo" value={alt} onChange={setAlt} required />
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a photo" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button
            disabled={busy || !alt.trim()}
            onClick={() =>
              void act(async () => {
                if (file) {
                  const form = new FormData();
                  form.append("image", file);
                  form.append("alt_text", alt);
                  onSaved(await postForm<Photo>(`${SCHOOL}/website/photos/${photo.id}`, form));
                } else {
                  onSaved(await patchJson<Photo>(`${SCHOOL}/website/photos/${photo.id}`, { alt_text: alt }));
                }
              })
            }
          >
            {file ? "Upload photo" : "Save description"}
          </Button>
        </>
      )}
      {alert}
    </Panel>
  );
}

export function WebsiteNewsScreen() {
  const admin = useRoleIs(ADMINISTRATOR);
  return (
    <Section title="News" intro="Stories for your website. Drafts stay private until you publish them." tabs={WEBSITE_TABS}>
      <RecordsView
        path={`${SCHOOL}/website/news`}
        noun="news story"
        fields={[
          { name: "title", label: "Title", required: true },
          { name: "summary", label: "Summary", required: true },
          { name: "body", label: "Story", type: "textarea", required: true },
          { name: "cover_alt", label: "Cover photo description" },
          { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["draft", "Draft"], ["published", "Published"]] },
        ]}
        canAdd={admin}
        canEdit={admin}
        canDelete={admin}
        actions={(row, replace) =>
          admin ? (
            row.status === "published" ? (
              <ActButton label="Unpublish" path={`${SCHOOL}/website/news/${row.id}/unpublish`} onDone={(r) => replace(r as Row)} />
            ) : (
              <ActButton label="Publish" path={`${SCHOOL}/website/news/${row.id}/publish`} onDone={(r) => replace(r as Row)} />
            )
          ) : null
        }
      />
    </Section>
  );
}

export function WebsiteFactsScreen() {
  const admin = useRoleIs(ADMINISTRATOR);
  return (
    <Section title="Facts and features" intro="Only true facts: leave out anything you can't stand behind." tabs={WEBSITE_TABS}>
      <div className="space-y-10">
        <RecordsView
          path={`${SCHOOL}/website/facts`}
          noun="fact"
          fields={[
            { name: "label", label: "Label", required: true },
            { name: "value", label: "Value", required: true },
            { name: "order", label: "Order", type: "number" },
            { name: "visible", label: "Shown", type: "boolean" },
          ]}
          canAdd={admin}
          canEdit={admin}
          canDelete={admin}
        />
        <Panel title="Feature blocks">
          <RecordsView
            path={`${SCHOOL}/website/features`}
            noun="feature"
            fields={[
              { name: "title", label: "Title", required: true },
              { name: "text", label: "Text", type: "textarea", required: true },
              { name: "enabled", label: "Shown", type: "boolean" },
              { name: "order", label: "Order", type: "number" },
            ]}
            canEdit={admin}
          />
        </Panel>
      </div>
    </Section>
  );
}

type Notice = { id: number; version: string; title: string; body: string; effective_from: string; is_draft: boolean };

/** The privacy notice editor, shared by schools and the platform. */
export function NoticesEditor({ path, canEdit }: { path: string; canEdit: boolean }) {
  const { data, error, reload } = useLoad<Notice[]>(path);
  const rows = data ?? [];
  return (
    <div className="space-y-6">
      {canEdit && (
        <Panel title="Write a new version">
          <RecordForm
            idPrefix="notice"
            submitLabel="Save draft"
            fields={[
              { name: "version", label: "Version", required: true, hint: "For example 2.0" },
              { name: "title", label: "Title" },
              { name: "body", label: "Notice", type: "textarea", required: true },
              { name: "effective_from", label: "Takes effect", type: "date", required: true },
            ]}
            send={(body) => postJson<Row>(path, body)}
            onSaved={reload}
          />
        </Panel>
      )}
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No notice yet." />
      {rows.map((notice) => (
        <Panel
          key={notice.id}
          title={`Version ${notice.version}${notice.is_draft ? " (draft)" : ""}`}
          actions={
            canEdit && notice.is_draft ? (
              <ActButton label="Approve and publish" confirm="Publish this version?" path={`${path}/${notice.id}`} onDone={reload} />
            ) : null
          }
        >
          <p className="text-sm text-ink-muted">Takes effect {when(notice.effective_from)}</p>
          <p className="whitespace-pre-line">{notice.body}</p>
        </Panel>
      ))}
    </div>
  );
}

export function WebsitePrivacyScreen() {
  return (
    <Section title="Privacy notice" intro="What your school does with families' information. Parents agree to the current version." tabs={WEBSITE_TABS}>
      <NoticesEditor path={`${SCHOOL}/website/notices`} canEdit={useRoleIs(ADMINISTRATOR)} />
    </Section>
  );
}

export function WebsiteLiveScreen() {
  const admin = useRoleIs(ADMINISTRATOR);
  const { data, setData, error } = useLoad<{ is_live: boolean; blockers: string[]; went_live_at: string | null }>(`${SCHOOL}/website/live`);
  return (
    <Section title="Go live" intro="Your website goes public once nothing is left to do." tabs={WEBSITE_TABS}>
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <Panel title={data.is_live ? "Your website is live" : "Not live yet"}>
          {data.blockers.length > 0 ? (
            <ul className="list-inside list-disc">
              {data.blockers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>Everything is ready.</p>
          )}
          {admin && (
            <ActButton
              label={data.is_live ? "Take the website offline" : "Mark site live"}
              variant={data.is_live ? "outline" : "primary"}
              confirm={data.is_live ? "Take it offline?" : undefined}
              path={`${SCHOOL}/website/live`}
              body={{ live: !data.is_live }}
              onDone={(r) => setData(r as typeof data)}
            />
          )}
        </Panel>
      )}
    </Section>
  );
}

// ---- Billing (the school's own bill from ADsmartschool) ------------------------------------

type Bill = { id: number; number: string; amount: number; paid: number; due: number; state: string; issued_on: string; due_on: string };
type Billing = {
  plan: string;
  status: string;
  balance_due: number;
  next_bill_on: string | null;
  billing_paused: boolean;
  bills: Bill[];
  payments: { id: number; bill: string; amount: number; method: string; received_on: string }[];
  how_to_pay: { bank: string; momo: string };
};

export function SchoolBillingScreen() {
  const { data, error } = useLoad<Billing>(`${SCHOOL}/billing`);
  const canPay = useRoleIs(ADMINISTRATOR, PROPRIETOR, ACCOUNTANT);
  const { act, busy, alert } = useAction();
  return (
    <Section title="Billing" intro="Your school's ADsmartschool plan, bills and receipts.">
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <div className="space-y-6">
          {data.billing_paused && (
            <p role="alert" className="rounded-card border border-danger bg-danger/10 p-4">
              Your school is paused until the overdue bill is paid. Paying it in full turns everything back on straight away.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat label="Plan" value={data.plan || "Not set up yet"} note={data.status ? words(data.status) : undefined} />
            <Stat label="Due now" value={<Money value={data.balance_due} />} />
            <Stat label="Next bill" value={data.next_bill_on ? when(data.next_bill_on) : "—"} />
          </dl>
          {data.bills.length > 0 && (
            <Table
              caption="Bills"
              head={["Bill", "Issued", "Due", "Amount", "Paid", "Status", ""]}
              rows={data.bills.map((bill) => [
                bill.number,
                when(bill.issued_on),
                when(bill.due_on),
                <Money key="a" value={bill.amount} />,
                <Money key="p" value={bill.paid} />,
                words(bill.state),
                canPay && bill.due > 0 ? (
                  <Button
                    key="pay"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const answer = await postJson<{ authorization_url: string }>(`${SCHOOL}/billing/bills/${bill.id}/pay`);
                        window.location.assign(answer.authorization_url);
                      })
                    }
                  >
                    Pay now
                  </Button>
                ) : null,
              ])}
            />
          )}
          {alert}
          {(data.how_to_pay.bank || data.how_to_pay.momo) && (
            <Panel title="Paying by hand">
              {data.how_to_pay.momo && <p>Mobile Money: {data.how_to_pay.momo}</p>}
              {data.how_to_pay.bank && <p>Bank: {data.how_to_pay.bank}</p>}
              <p className="text-sm text-ink-muted">Use your bill number as the reference.</p>
            </Panel>
          )}
          {data.payments.length > 0 && (
            <Table caption="Receipts" head={["Bill", "Paid", "How", "Amount"]} rows={data.payments.map((p) => [p.bill, when(p.received_on), words(p.method), ghs(p.amount)])} />
          )}
        </div>
      )}
    </Section>
  );
}

// ---- Support and data protection ------------------------------------------------------------

export const SUPPORT_TABS = [
  ["/support", "Help"],
  ["/support/access", "Support access"],
  ["/support/data", "Data protection"],
  ["/support/news", "News from ADsmartschool"],
] as const;

type Thread = {
  id: number;
  subject: string;
  status: string;
  updated_at: string;
  messages?: { id: number; author: string; from_platform: boolean; body: string; created_at: string }[];
};

export function SupportScreen() {
  const { data, error, reload } = useLoad<Thread[]>(`${SCHOOL}/support/threads`);
  const [open, setOpen] = useState<number | null>(null);
  const rows = data ?? [];
  return (
    <Section title="Help" intro="Ask the ADsmartschool team. They answer here." tabs={SUPPORT_TABS}>
      <Panel title="Ask a question">
        <RecordForm
          idPrefix="thread"
          submitLabel="Send"
          fields={[
            { name: "subject", label: "Subject", required: true },
            { name: "body", label: "Your question", type: "textarea", required: true },
          ]}
          send={(body) => postJson<Row>(`${SCHOOL}/support/threads`, body)}
          onSaved={reload}
        />
      </Panel>
      <div className="mt-6 space-y-4">
        <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No conversations yet." />
        {rows.map((thread) => (
          <Panel
            key={thread.id}
            title={`${thread.subject} · ${words(thread.status)}`}
            actions={
              <Button variant="outline" onClick={() => setOpen(open === thread.id ? null : thread.id)}>
                {open === thread.id ? "Hide" : "Open"}
              </Button>
            }
          >
            {open === thread.id && <Conversation path={`${SCHOOL}/support/threads/${thread.id}`} />}
          </Panel>
        ))}
      </div>
    </Section>
  );
}

/** A support conversation and a reply box; used by schools and the platform team. */
export function Conversation({ path }: { path: string }) {
  const { data, setData, error } = useLoad<Thread>(path);
  const [body, setBody] = useState("");
  const { error: problem, attempt, busy, run } = useSubmit();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    void run(async () => {
      setData(await postJson<Thread>(path, { body }));
      setBody("");
    });
  }
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {(data.messages ?? []).map((message) => (
          <li key={message.id} className={`rounded-control p-3 ${message.from_platform ? "bg-indigo/10" : "bg-ink/5"}`}>
            <p className="text-sm text-ink-muted">
              {message.from_platform ? "ADsmartschool" : message.author} · {when(message.created_at)}
            </p>
            <p className="whitespace-pre-line">{message.body}</p>
          </li>
        ))}
      </ol>
      <form onSubmit={onSubmit} className="space-y-2">
        <FormAlert message={problem} focusKey={attempt} />
        <label className="block font-medium">
          Reply
          <textarea value={body} onChange={(e) => setBody(e.target.value)} className={`${textareaClasses} mt-2`} />
        </label>
        <Button type="submit" disabled={busy}>
          Send reply
        </Button>
      </form>
    </div>
  );
}

type Grant = { id: number; hours: number; starts_at: string; ends_at: string; ended_at: string | null; active: boolean; granted_by: string };

export function SupportAccessScreen() {
  const admin = useRoleIs(ADMINISTRATOR);
  const { data, error, reload } = useLoad<{ current: Grant | null; history: Grant[] }>(`${SCHOOL}/support/access`);
  const { act, busy, alert } = useAction();
  return (
    <Section title="Support access" intro="The ADsmartschool team can't see your pupils, parents or staff unless you let them, for 24 or 72 hours. Every record they open is logged." tabs={SUPPORT_TABS}>
      {!admin && <p>Only the Administrator can change support access.</p>}
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && (
        <div className="space-y-6">
          <Panel title={data.current ? `On until ${when(data.current.ends_at)}` : "Off"}>
            {admin &&
              (data.current ? (
                <Button disabled={busy} onClick={() => void act(async () => { await deleteJson(`${SCHOOL}/support/access`); reload(); })}>
                  Turn off now
                </Button>
              ) : (
                <span className="flex flex-wrap gap-3">
                  {[24, 72].map((hours) => (
                    <Button key={hours} disabled={busy} onClick={() => void act(async () => { await postJson(`${SCHOOL}/support/access`, { hours }); reload(); })}>
                      Allow for {hours} hours
                    </Button>
                  ))}
                </span>
              ))}
            {alert}
          </Panel>
          {data.history.length > 0 && (
            <Table
              caption="Earlier access"
              head={["From", "Until", "Given by"]}
              rows={data.history.map((g) => [when(g.starts_at), when(g.ended_at ?? g.ends_at), g.granted_by])}
            />
          )}
        </div>
      )}
    </Section>
  );
}

export function DataProtectionScreen() {
  const admin = useRoleIs(ADMINISTRATOR);
  const retention = useLoad<{ left_pupil_years: number; staff_years: number }>(`${SCHOOL}/retention`);
  return (
    <Section title="Data protection" intro="Requests from families, any breach and how long records are kept (Data Protection Act, 2012)." tabs={SUPPORT_TABS}>
      <div className="space-y-10">
        <Panel title="Requests from families">
          <RecordsView
            path={`${SCHOOL}/data-requests`}
            noun="request"
            title={(row) => `${String(row.parent_label)} · ${words(row.kind)}`}
            fields={[
              { name: "parent", label: "Parent", type: "option", options: "parents", required: true },
              { name: "kind", label: "Asked for", type: "choice", required: true, choices: [["COPY", "A copy of our data"], ["CORRECTION", "A correction"], ["DELETION", "Deletion"], ["OTHER", "Something else"]] },
              { name: "details", label: "Details", type: "textarea" },
              { name: "due_on", label: "Answer by", type: "date", required: true },
              { name: "status", label: "Status", type: "choice", required: true, choices: [["OPEN", "Open"], ["DONE", "Done"], ["REFUSED", "Refused"]] },
              { name: "response", label: "Our answer", type: "textarea" },
            ]}
            canAdd={admin}
            canEdit={admin}
          />
        </Panel>
        {admin && (
          <Panel title="Breach record">
            <RecordsView
              path={`${SCHOOL}/breaches`}
              noun="breach record"
              title={(row) => `Found ${when(row.discovered_on)}`}
              fields={[
                { name: "discovered_on", label: "Found on", type: "date", required: true },
                { name: "occurred_on", label: "Happened on", type: "date" },
                { name: "description", label: "What happened", type: "textarea", required: true },
                { name: "data_affected", label: "Information affected", required: true },
                { name: "people_affected", label: "People affected", type: "number" },
                { name: "actions_taken", label: "What was done", type: "textarea" },
                { name: "reported_to_regulator", label: "Reported to the Data Protection Commission", type: "boolean" },
                { name: "reported_on", label: "Reported on", type: "date" },
              ]}
              canAdd
              canEdit
              emptyText="No breaches recorded."
            />
          </Panel>
        )}
        {retention.data && (
          <Panel title="How long records are kept">
            <RecordForm
              idPrefix="retention"
              submitLabel="Save"
              row={{ id: 0, ...retention.data }}
              fields={[
                { name: "left_pupil_years", label: "Years to keep pupils who have left", type: "number", required: true },
                { name: "staff_years", label: "Years to keep staff who have left", type: "number", required: true },
              ]}
              send={(body) => patchJson<Row>(`${SCHOOL}/retention`, body)}
              onSaved={retention.reload}
            />
          </Panel>
        )}
      </div>
    </Section>
  );
}

export function PlatformNewsScreen() {
  const { data, error } = useLoad<{ id: number; title: string; body: string; published_at: string }[]>(`${SCHOOL}/support/announcements`);
  const rows = data ?? [];
  return (
    <Section title="News from ADsmartschool" tabs={SUPPORT_TABS}>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No news yet." />
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.id}>
            <Panel title={row.title}>
              <p className="text-sm text-ink-muted">{when(row.published_at)}</p>
              <p className="whitespace-pre-line">{row.body}</p>
            </Panel>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---- Year end ------------------------------------------------------------------------------

export function YearEndScreen() {
  const admin = useRoleIs(ADMINISTRATOR);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ready = from && to && from !== to;
  return (
    <Section title="Year end" intro="Move every class up a year into next year's classes. Choose pupils who repeat or leave first; the rest move up, and the last year completes.">
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Picker id="rollover-from" label="From year" source="years" value={from} onChange={setFrom} />
        <Picker id="rollover-to" label="Into year" source="years" value={to} onChange={setTo} />
      </div>
      {ready && <RolloverPlan key={`${from}-${to}`} from={from} to={to} canRun={admin} />}
    </Section>
  );
}

function RolloverPlan({ from, to, canRun }: { from: string; to: string; canRun: boolean }) {
  const { data, error } = useLoad<{ class: string; pupils: number; moves_to: string }[]>(`${SCHOOL}/rollover?from=${from}&to=${to}`);
  const [repeaters, setRepeaters] = useState<string[]>([]);
  const [leavers, setLeavers] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [result, setResult] = useState<Record<string, number> | null>(null);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <div className="space-y-6">
      <Table caption="What will happen" head={["Class", "Pupils", "Moves to"]} rows={data.map((row) => [row.class, row.pupils, row.moves_to])} />
      {canRun && (
        <Panel title="Exceptions">
          <div className="flex flex-wrap items-end gap-3">
            <Picker id="rollover-pupil" label="Pupil" source="pupils" value={pick} onChange={setPick} />
            <Button variant="outline" disabled={!pick} onClick={() => setRepeaters([...new Set([...repeaters, pick])])}>
              Repeats the year
            </Button>
            <Button variant="outline" disabled={!pick} onClick={() => setLeavers([...new Set([...leavers, pick])])}>
              Leaves the school
            </Button>
          </div>
          <p className="text-sm">
            Repeating: {repeaters.length} · Leaving: {leavers.length}
          </p>
          <ActButton
            label="Move everyone up"
            variant="primary"
            confirm="Move every class into the new year? This closes this year's class places."
            path={`${SCHOOL}/rollover`}
            body={{ from_year: Number(from), to_year: Number(to), repeaters: repeaters.map(Number), leavers: leavers.map(Number) }}
            onDone={(r) => setResult(r as Record<string, number>)}
          />
          {result && (
            <p role="status">
              Done: {result.promoted} moved up, {result.repeated} repeating, {result.left} left, {result.completed} completed.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

// ---- Reports -------------------------------------------------------------------------------

type ClassFinance = { term: string; classes: { class: string; pupils: number; billed: number; owed: number; paid_in_full: number; debtors: number }[] };

export function ReportsScreen() {
  const money = useRoleIs(ACCOUNTANT, ADMINISTRATOR, HEAD_TEACHER, PROPRIETOR);
  const leader = useRoleIs(ADMINISTRATOR, HEAD_TEACHER, PROPRIETOR);
  const [term, setTerm] = useState("");
  const finance = useLoad<ClassFinance>(`/api/school/finance/classes${term ? `?term=${term}` : ""}`);
  const downloads: [string, string, boolean][] = [
    ["Pupils", "pupils", leader],
    ["Debtors", "debtors", money],
    ["Payments", "payments", money],
    ["Attendance", "attendance", leader],
    ["Audit log", "audit", useRoleIs(ADMINISTRATOR, HEAD_TEACHER)],
  ];
  return (
    <Section title="Reports" intro="Download for Excel, or print any page with your browser's Print.">
      <div className="space-y-8">
        <Panel title="Downloads">
          <ul className="flex flex-wrap gap-3">
            {downloads
              .filter(([, , allowed]) => allowed)
              .map(([label, file]) => (
                <li key={file}>
                  <a href={`${SCHOOL}/reports/${file}.csv`} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 font-semibold hover:bg-ink/5">
                    {label} (CSV)
                  </a>
                </li>
              ))}
          </ul>
        </Panel>
        {money && (
          <Panel title="Fees by class">
            <div className="max-w-xs">
              <Picker id="report-term" label="Term" source="terms" value={term} onChange={setTerm} includeAll="This term" />
            </div>
            {finance.data && (
              <Table
                caption="Fees by class"
                head={["Class", "Pupils", "Billed", "Still owed", "Paid in full", "Owing"]}
                rows={finance.data.classes.map((row) => [
                  row.class,
                  row.pupils,
                  <Money key="b" value={row.billed} />,
                  <Money key="o" value={row.owed} />,
                  row.paid_in_full,
                  row.debtors,
                ])}
              />
            )}
          </Panel>
        )}
      </div>
    </Section>
  );
}

// ---- Assessment setup ----------------------------------------------------------------------

const BANDS: [string, string][] = [
  ["creche", "Crèche"],
  ["nursery", "Nursery"],
  ["kg", "Kindergarten"],
  ["lower_primary", "Basic 1–3"],
  ["upper_primary", "Basic 4–6"],
  ["jhs", "Junior High School"],
];

export function AssessmentSetupScreen() {
  const canEdit = useRoleIs(ADMINISTRATOR, HEAD_TEACHER);
  const settings = useLoad<{ withhold_for_arrears: boolean }>(`${SCHOOL}/learning/report-settings`);
  const { act, busy, alert } = useAction();
  return (
    <Section title="Assessment" intro="How each level is marked: the parts of the assessment and their weights, the grades, the pass mark and positions.">
      <div className="space-y-10">
        <Panel title="Parts of the assessment">
          <RecordsView
            path={`${SCHOOL}/learning/components`}
            noun="part"
            fields={[
              { name: "band", label: "Level", type: "choice", choices: BANDS, required: true },
              { name: "academic_year", label: "School year", type: "option", options: "years", required: true },
              { name: "name", label: "Name", required: true, hint: "For example Class test or Exam" },
              { name: "weight", label: "Weight (% of the total)", type: "number", required: true },
              { name: "max_score", label: "Marked out of", type: "number", required: true },
              { name: "order", label: "Order", type: "number" },
            ]}
            canAdd={canEdit}
            canEdit={canEdit}
            canDelete={canEdit}
          />
        </Panel>
        <Panel title="Grades">
          <RecordsView
            path={`${SCHOOL}/learning/grading-scales`}
            noun="grading scale"
            fields={[
              { name: "band", label: "Level", type: "choice", choices: BANDS, required: true },
              { name: "academic_year", label: "School year", type: "option", options: "years", required: true },
            ]}
            canAdd={canEdit}
            canDelete={canEdit}
            actions={(row, replace) => <GradeRows row={row} canEdit={canEdit} onSaved={replace} />}
          />
        </Panel>
        <Panel title="Pass mark and positions">
          <RecordsView
            path={`${SCHOOL}/learning/result-rules`}
            noun="rule"
            fields={[
              { name: "band", label: "Level", type: "choice", choices: BANDS, required: true },
              { name: "academic_year", label: "School year", type: "option", options: "years", required: true },
              { name: "pass_mark", label: "Pass mark", type: "number", required: true },
              { name: "positions_enabled", label: "Show positions (Basic 4 and up only)", type: "boolean" },
              {
                name: "tie_rule",
                label: "Ties",
                type: "choice",
                choices: [["SHARED", "Share the position and skip the next (1, 1, 3)"], ["DENSE", "Share the position, next follows (1, 1, 2)"]],
              },
            ]}
            canAdd={canEdit}
            canEdit={canEdit}
            canDelete={canEdit}
          />
        </Panel>
        {settings.data && (
          <Panel title="Report cards">
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                disabled={!canEdit || busy}
                checked={settings.data.withhold_for_arrears}
                onChange={(e) =>
                  void act(async () => {
                    settings.setData(await patchJson(`${SCHOOL}/learning/report-settings`, { withhold_for_arrears: e.target.checked }));
                  })
                }
                className="size-5 accent-indigo"
              />
              Hold report cards from families who owe fees (the Head Teacher can release one)
            </label>
            {alert}
          </Panel>
        )}
      </div>
    </Section>
  );
}

type Grade = { min: string; max: string; grade: string; remark: string };

function GradeRows({ row, canEdit, onSaved }: { row: Row; canEdit: boolean; onSaved: (row: Row) => void }) {
  const start = ((row.rows as Grade[] | undefined) ?? []).map((g) => ({ ...g, min: String(g.min), max: String(g.max), remark: g.remark ?? "" }));
  const [grades, setGrades] = useState<Grade[]>(start.length ? start : [{ min: "", max: "", grade: "", remark: "" }]);
  const { act, busy, alert } = useAction();
  const set = (index: number, key: keyof Grade, value: string) => setGrades(grades.map((g, i) => (i === index ? { ...g, [key]: value } : g)));
  return (
    <div className="w-full space-y-2">
      {grades.map((grade, index) => (
        <div key={index} className="grid grid-cols-4 gap-2">
          {(["min", "max", "grade", "remark"] as const).map((key) => (
            <input
              key={key}
              aria-label={`${key} for row ${index + 1}`}
              placeholder={{ min: "From", max: "To", grade: "Grade", remark: "Remark" }[key]}
              disabled={!canEdit}
              value={grade[key]}
              onChange={(e) => set(index, key, e.target.value)}
              className={`${inputClasses} min-h-11 px-2 py-2`}
            />
          ))}
        </div>
      ))}
      {canEdit && (
        <span className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setGrades([...grades, { min: "", max: "", grade: "", remark: "" }])}>
            Add a grade
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void act(async () =>
                onSaved(
                  await patchJson<Row>(`${SCHOOL}/learning/grading-scales/${row.id}`, {
                    rows: grades.filter((g) => g.grade.trim()).map((g) => ({ min: Number(g.min), max: Number(g.max), grade: g.grade.trim(), remark: g.remark.trim() })),
                  }),
                ),
              )
            }
          >
            Save grades
          </Button>
        </span>
      )}
      {alert}
    </div>
  );
}
