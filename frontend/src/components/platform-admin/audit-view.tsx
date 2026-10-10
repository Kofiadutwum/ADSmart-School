"use client";

import { useEffect, useState } from "react";
import { errorMessage, getJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/dates";
import type { AuditEntry } from "@/lib/types";

/** STATUS_CHANGED → "Status changed". */
export function describeAction(action: string): string {
  const words = action.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Platform events, and everything the platform team did in any school (amendment §4). */
export function AuditView() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<AuditEntry[]>("/api/platform/audit").then(
      (rows) => {
        if (!cancelled) setEntries(rows);
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
        <h1 className="text-3xl font-semibold">Audit log</h1>
        <p className="mt-1 text-ink-muted">
          Platform events, and everything the platform team did in a school. The latest 200.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {entries === null && !error && <p className="text-ink-muted">Loading…</p>}
      {entries?.length === 0 && <p className="text-ink-muted">Nothing recorded yet.</p>}
      {entries && entries.length > 0 && (
        // Focusable so keyboard users can scroll it sideways on a phone.
        <div role="region" aria-label="Audit entries" tabIndex={0} className="surface overflow-x-auto rounded-card">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Platform audit log</caption>
            <thead className="bg-ink/5">
              <tr>
                {["When", "Who", "What", "School", "Details"].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-line">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
                  <td className="px-4 py-3">{entry.actor_name || "Not signed in"}</td>
                  <td className="px-4 py-3">{describeAction(entry.action)}</td>
                  <td className="px-4 py-3">{entry.school ?? "Platform"}</td>
                  <td className="px-4 py-3">{entry.reason || `${entry.entity_type} ${entry.entity_id}`.trim()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
