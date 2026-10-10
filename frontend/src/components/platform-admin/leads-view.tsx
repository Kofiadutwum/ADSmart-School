"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { errorMessage, getJson, patchJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import { formatPhoneLocal } from "@/lib/identifiers";
import type { Lead, LeadStatus } from "@/lib/types";

const LEAD_STATUS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  onboarded: "Onboarded",
  closed: "Closed",
};

/** "Get your school online" requests from the platform site (amendment §5, §6). */
export function LeadsView() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<Lead[]>("/api/platform/leads").then(
      (rows) => {
        if (!cancelled) setLeads(rows);
      },
      (caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Leads</h1>
        <p className="mt-1 text-ink-muted">Requests from the &ldquo;Get your school online&rdquo; form, newest first.</p>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {leads === null && !error && <p className="text-ink-muted">Loading…</p>}
      {leads?.length === 0 && <p className="text-ink-muted">No requests yet.</p>}
      {leads && leads.length > 0 && (
        <ul className="grid gap-4">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onSaved={(saved) => setLeads((rows) => rows?.map((row) => (row.id === saved.id ? saved : row)) ?? null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadCard({ lead, onSaved }: { lead: Lead; onSaved: (lead: Lead) => void }) {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [notes, setNotes] = useState(lead.staff_notes);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      onSaved(await patchJson<Lead>(`/api/platform/leads/${lead.id}`, { status, staff_notes: notes }));
      setMessage("Saved.");
    } catch (caught) {
      setMessage(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="surface rounded-card p-5">
      <h2 className="text-lg font-semibold">
        {lead.school_name} <span className="font-normal text-ink-muted">· {lead.town}</span>
      </h2>
      <p className="text-sm text-ink-muted">{formatDateTime(lead.created_at)}</p>
      <p className="mt-2">
        {lead.contact_name} ·{" "}
        <a href={`tel:${lead.phone}`} className="link">
          {formatPhoneLocal(lead.phone)}
        </a>
        {lead.email && (
          <>
            {" · "}
            <a href={`mailto:${lead.email}`} className="link">
              {lead.email}
            </a>
          </>
        )}
      </p>
      {lead.message && <p className="mt-2 whitespace-pre-line">{lead.message}</p>}
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <Field id={`lead-${lead.id}-status`} label="Status" required>
          {(props) => (
            <select
              {...props}
              value={status}
              onChange={(event) => setStatus(event.target.value as LeadStatus)}
              className={inputClasses}
            >
              {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((value) => (
                <option key={value} value={value}>
                  {LEAD_STATUS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id={`lead-${lead.id}-notes`} label="Notes">
          {(props) => (
            <textarea
              {...props}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={inputClasses}
            />
          )}
        </Field>
        <Button type="submit" variant="outline" disabled={busy} aria-label={`Save ${lead.school_name}`}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
    </li>
  );
}
