"use client";

import Link from "next/link";
import { useState } from "react";
import { LoadState, useAction, useLoad } from "@/components/portal/kit";
import { OneTimePasswordNote } from "@/components/portal/one-time-password-note";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client-api";
import { formatDate } from "@/lib/dates";
import type { ClassPupils, OneTimePassword, TeacherPupilView } from "@/lib/types";
import { PersonPhoto } from "./person-photo";
import { STATUS_LABEL } from "./pupils-view";

const classUrl = (classId: number) => `/api/school/classes/${classId}/pupils`;
const link = "text-indigo underline-offset-4 hover:underline";

/** A teacher's class list (Phase 1 spec §7.3), from their own assignments. */
export function ClassListView({ classId }: { classId: number }) {
  const { data, error } = useLoad<ClassPupils>(classUrl(classId));
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/my-teaching" className={`text-sm ${link}`}>
          My classes
        </Link>
        <h1 className="text-3xl font-semibold">{data.class.name}</h1>
        {data.class.is_class_teacher && <p className="text-ink-muted">You are the class teacher.</p>}
      </div>
      <LoadState
        error={null}
        loading={false}
        empty={data.pupils.length === 0}
        emptyText="No pupils in this class yet."
      />
      {data.pupils.length > 0 && (
        <ul className="surface divide-y divide-line rounded-card shadow-elev-1">
          {data.pupils.map((pupil) => (
            <li key={pupil.id} className="flex items-center gap-4 p-4">
              <PersonPhoto
                src={pupil.has_photo ? `${classUrl(classId)}/${pupil.id}/photo` : null}
                initials={pupil.initials}
                name={pupil.name}
                size="sm"
              />
              <div>
                <Link href={`/my-teaching/${classId}/${pupil.id}`} className={`font-semibold ${link}`}>
                  {pupil.name}
                </Link>
                <p className="text-sm text-ink-muted">{pupil.student_id}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A pupil as their teacher sees them: no restricted fields. The class teacher also sees the
 * parent and emergency contacts, and gives pupils from Basic 4 their sign-in (P1 §4.3, §5.1). */
export function ClassPupilView({ classId, pupilId }: { classId: number; pupilId: number }) {
  const url = `${classUrl(classId)}/${pupilId}`;
  const { data, setData, error } = useLoad<TeacherPupilView>(url);
  const [password, setPassword] = useState<OneTimePassword | null>(null);
  const { act, busy, alert } = useAction();
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;

  const issue = () =>
    act(async () => {
      const issued = await postJson<OneTimePassword>(`/api/school/pupils/${data.id}/login`);
      setPassword(issued);
      setData({ ...data, login: issued.username });
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-5">
        <PersonPhoto src={data.has_photo ? `${url}/photo` : null} initials={data.initials} name={data.name} size="lg" />
        <div className="space-y-1">
          <Link href={`/my-teaching/${classId}`} className={`text-sm ${link}`}>
            {data.class}
          </Link>
          <h1 className="text-3xl font-semibold">{data.name}</h1>
          <p className="text-ink-muted">
            Student ID {data.student_id} · {data.gender === "F" ? "Girl" : "Boy"} · born{" "}
            {formatDate(data.date_of_birth)}
            {data.status !== "ACTIVE" && ` · ${STATUS_LABEL[data.status]}`}
          </p>
        </div>
      </div>
      {data.parents && (
        <section aria-labelledby="pupil-parents-title" className="surface space-y-2 rounded-card p-5 shadow-elev-1">
          <h2 id="pupil-parents-title" className="text-lg font-semibold">
            Parents
          </h2>
          {data.parents.length === 0 && <p className="text-sm text-ink-muted">No parents linked yet.</p>}
          <ul className="space-y-1">
            {data.parents.map((parent) => (
              <li key={parent.phone}>
                {parent.name} ({parent.relationship}) · <a href={`tel:${parent.phone}`}>{parent.phone}</a>
                {parent.alt_phone && ` · ${parent.alt_phone}`}
                {parent.is_primary_contact && " · main contact"}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.emergency_contacts && (
        <section aria-labelledby="pupil-emergency-title" className="surface space-y-2 rounded-card p-5 shadow-elev-1">
          <h2 id="pupil-emergency-title" className="text-lg font-semibold">
            Emergency contacts
          </h2>
          {data.emergency_contacts.length === 0 && <p className="text-sm text-ink-muted">None recorded yet.</p>}
          <ul className="space-y-1">
            {data.emergency_contacts.map((contact) => (
              <li key={`${contact.name}-${contact.phone}`}>
                {contact.name} ({contact.relationship}) · <a href={`tel:${contact.phone}`}>{contact.phone}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.can_have_login && (
        <section aria-labelledby="pupil-signin-title" className="space-y-3">
          <h2 id="pupil-signin-title" className="text-lg font-semibold">
            Sign-in
          </h2>
          <p>{data.login ? `Signs in with their Student ID, ${data.login}.` : "No sign-in yet."}</p>
          {data.can_issue_login && (
            <Button variant="outline" disabled={busy} onClick={() => void issue()}>
              {data.login ? "Reset the password" : "Give a sign-in"}
            </Button>
          )}
          {alert}
          {password && <OneTimePasswordNote password={password} />}
        </section>
      )}
    </div>
  );
}
