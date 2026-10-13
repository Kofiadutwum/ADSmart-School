"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ConfirmDelete,
  InputField,
  LoadState,
  textareaClasses,
  useAction,
  useLoad,
  useSubmit,
} from "@/components/portal/kit";
import { OneTimePasswordNote } from "@/components/portal/one-time-password-note";
import { SaveBar } from "@/components/portal/save-bar";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, patchJson, postForm, postJson } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type { EmergencyContactRow, OneTimePassword, PupilDetail, PupilStatus } from "@/lib/types";
import { PersonPhoto } from "./person-photo";
import { ChangesTab, ClassHistoryTab, ConsentsTab, ParentsTab, PickupsTab } from "./pupil-tabs";
import { PupilBadges, STATUS_LABEL } from "./pupils-view";

const TABS = [
  ["overview", "Overview"],
  ["parents", "Parents"],
  ["pickups", "Pick-up persons"],
  ["history", "Class history"],
  ["consents", "Consents"],
  ["changes", "Change history"],
] as const;
type Tab = (typeof TABS)[number][0];

/** One pupil's record (Phase 1 spec §7.2), in tabs: Overview · Parents · Pick-up persons ·
 * Class history · Consents · Change history. */
export function PupilDetailView({ id, canEdit }: { id: number; canEdit: boolean }) {
  const url = `/api/school/pupils/${id}`;
  const { data, setData, error } = useLoad<PupilDetail>(url);
  const [tab, setTab] = useState<Tab>("overview");
  const [photoVersion, setPhotoVersion] = useState(0);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  const photo = data.has_photo ? `${url}/photo?v=${photoVersion}` : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-5">
        <PersonPhoto src={photo} initials={data.initials} name={data.name} size="lg" />
        <div className="space-y-1">
          <Link href="/pupils" className="text-sm text-indigo underline-offset-4 hover:underline">
            All pupils
          </Link>
          <h1 className="text-3xl font-semibold">{data.name}</h1>
          <p className="text-ink-muted">
            Student ID {data.student_id} · {data.class || "Not in a class"}
          </p>
          <PupilBadges row={data} />
        </div>
      </div>
      <TabList value={tab} onChange={setTab} />
      <div role="tabpanel" id={`pupil-panel-${tab}`} aria-labelledby={`pupil-tab-${tab}`}>
        {tab === "overview" && (
          <Overview
            url={url}
            pupil={data}
            canEdit={canEdit}
            photo={photo}
            onSaved={setData}
            onPhoto={(saved) => {
              setData(saved);
              setPhotoVersion((version) => version + 1);
            }}
          />
        )}
        {tab === "parents" && <ParentsTab pupil={data} canEdit={canEdit} />}
        {tab === "pickups" && <PickupsTab pupil={data} canEdit={canEdit} />}
        {tab === "history" && <ClassHistoryTab pupil={data} />}
        {tab === "consents" && <ConsentsTab pupil={data} canEdit={canEdit} />}
        {tab === "changes" && <ChangesTab pupil={data} />}
      </div>
    </div>
  );
}

/** Tabs with arrow-key movement between them (WAI-ARIA tabs pattern). */
function TabList({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex(([key]) => key === value);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + TABS.length) % TABS.length;
    onChange(TABS[next][0]);
    refs.current[next]?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label="Pupil record"
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto border-b border-line pb-2"
    >
      {TABS.map(([key, label], index) => (
        <button
          key={key}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="tab"
          id={`pupil-tab-${key}`}
          aria-selected={value === key}
          aria-controls={`pupil-panel-${key}`}
          tabIndex={value === key ? 0 : -1}
          onClick={() => onChange(key)}
          className={cn(
            "inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-control px-3 text-sm font-semibold",
            value === key ? "bg-ink/10 text-ink" : "text-ink-muted hover:bg-ink/5 hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type SectionProps = { url: string; pupil: PupilDetail; canEdit: boolean; onSaved: (pupil: PupilDetail) => void };
type OverviewProps = SectionProps & { photo: string | null; onPhoto: (pupil: PupilDetail) => void };

function Overview({ url, pupil, canEdit, photo, onSaved, onPhoto }: OverviewProps) {
  return (
    <div className="space-y-8 pt-4">
      {canEdit && pupil.is_demo && <DemoNote url={url} onSaved={onSaved} />}
      <ProfileFields key={pupil.id} url={url} pupil={pupil} canEdit={canEdit} onSaved={onSaved} />
      <StatusSection url={url} pupil={pupil} canEdit={canEdit} onSaved={onSaved} />
      <ContactsSection url={url} pupil={pupil} canEdit={canEdit} onSaved={onSaved} />
      <PhotoSection url={url} pupil={pupil} canEdit={canEdit} photo={photo} onSaved={onPhoto} />
      {pupil.can_have_login && <LoginSection url={url} pupil={pupil} canEdit={canEdit} onSaved={onSaved} />}
    </div>
  );
}

function DemoNote({ url, onSaved }: { url: string; onSaved: (pupil: PupilDetail) => void }) {
  const { act, busy, alert } = useAction();
  const makeReal = () => act(async () => onSaved(await postJson<PupilDetail>(`${url}/make-real`)));
  return (
    <section className="surface flex flex-wrap items-center gap-4 rounded-card p-4 shadow-elev-1">
      <p>This is a demo record. Demo records are never texted, and can be removed together.</p>
      <Button variant="outline" disabled={busy} onClick={() => void makeReal()}>
        This is now a real record
      </Button>
      {alert}
    </section>
  );
}

const PROFILE = [
  ["first_name", "First name", true],
  ["middle_name", "Middle name", false],
  ["surname", "Surname", true],
  ["date_of_birth", "Date of birth", true],
  ["previous_school", "Previous school", false],
  ["address", "Address", false],
  ["pickup_point", "School bus pick-up point", false],
] as const;
type ProfileName = (typeof PROFILE)[number][0] | "gender";

function valuesOf(pupil: PupilDetail): Record<ProfileName, string> {
  const values = Object.fromEntries(PROFILE.map(([name]) => [name, pupil[name]])) as Record<ProfileName, string>;
  return { ...values, gender: pupil.gender };
}

function ProfileFields({ url, pupil, canEdit, onSaved }: SectionProps) {
  const [values, setValues] = useState(() => valuesOf(pupil));
  const [notice, setNotice] = useState<string | null>(null);
  const { error, errors, attempt, busy, run } = useSubmit();
  const set = (name: ProfileName) => (value: string) => setValues({ ...values, [name]: value });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    void run(async () => {
      const saved = await patchJson<PupilDetail>(url, values);
      onSaved(saved);
      setValues(valuesOf(saved));
      setNotice("Saved.");
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="pupil-profile-title" className="space-y-5">
      <h2 id="pupil-profile-title" className="text-xl font-semibold">
        Profile
      </h2>
      <p className="text-sm text-ink-muted">Admitted {pupil.admission_date}.</p>
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-5 lg:grid-cols-2">
        {PROFILE.map(([name, label, required]) => (
          <InputField
            key={name}
            id={`pupil-${name}`}
            label={label}
            type={name === "date_of_birth" ? "date" : "text"}
            required={required}
            disabled={!canEdit}
            value={values[name]}
            onChange={set(name)}
            error={errors[name]}
          />
        ))}
        <Field id="pupil-gender" label="Gender" required error={errors.gender}>
          {(props) => (
            <select
              {...props}
              disabled={!canEdit}
              value={values.gender}
              onChange={(event) => set("gender")(event.target.value)}
              className={inputClasses}
            >
              <option value="F">Female</option>
              <option value="M">Male</option>
            </select>
          )}
        </Field>
      </div>
      {canEdit && (
        <SaveBar>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
        </SaveBar>
      )}
    </form>
  );
}

function StatusSection({ url, pupil, canEdit, onSaved }: SectionProps) {
  const [status, setStatus] = useState<PupilStatus>(pupil.status === "ACTIVE" ? "WITHDRAWN" : "ACTIVE");
  const [reason, setReason] = useState("");
  const { error, errors, attempt, busy, run, fail } = useSubmit();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) return fail("Please check the highlighted fields.", { reason: "Give a reason." });
    void run(async () => {
      onSaved(await postJson<PupilDetail>(`${url}/status`, { status, reason }));
      setReason("");
    });
  }

  return (
    <section aria-labelledby="pupil-status-title" className="space-y-3">
      <h2 id="pupil-status-title" className="text-xl font-semibold">
        Status
      </h2>
      <p>Status: {STATUS_LABEL[pupil.status]}</p>
      {canEdit && (
        <form
          noValidate
          onSubmit={onSubmit}
          aria-label="Change status"
          className="max-w-xl space-y-4 rounded-control bg-ink/5 p-4"
        >
          <FormAlert message={error} focusKey={attempt} />
          <p className="text-sm text-ink-muted">
            Pupils are never deleted. Leaving or a suspension is a status with a reason.
          </p>
          <Field id="pupil-new-status" label="New status" required error={errors.status}>
            {(props) => (
              <select
                {...props}
                value={status}
                onChange={(event) => setStatus(event.target.value as PupilStatus)}
                className={inputClasses}
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="pupil-status-reason" label="Reason" required error={errors.reason}>
            {(props) => (
              <textarea
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={textareaClasses}
              />
            )}
          </Field>
          <Button type="submit" disabled={busy}>
            Change status
          </Button>
        </form>
      )}
    </section>
  );
}

function ContactsSection({ url, pupil, canEdit, onSaved }: SectionProps) {
  const { data, setData, error } = useLoad<EmergencyContactRow[]>(`${url}/contacts`);
  const { act, busy, alert } = useAction();
  const contacts = data ?? [];

  function changed(next: EmergencyContactRow[]) {
    setData(next);
    onSaved({ ...pupil, contacts_incomplete: next.length < 2 });
  }

  const remove = (contact: EmergencyContactRow) =>
    act(async () => {
      await deleteJson(`/api/school/contacts/${contact.id}`);
      changed(contacts.filter((row) => row.id !== contact.id));
    });

  return (
    <section aria-labelledby="pupil-contacts-title" className="space-y-3">
      <h2 id="pupil-contacts-title" className="text-xl font-semibold">
        Emergency contacts
      </h2>
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      {data && contacts.length < 2 && (
        <p className="rounded-control bg-copper/15 p-3 text-sm">
          Incomplete: add at least two emergency contacts, so someone can always be reached.
        </p>
      )}
      {contacts.length > 0 && (
        <ul className="surface divide-y divide-line rounded-card shadow-elev-1">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{contact.name}</p>
                <p className="text-sm text-ink-muted">
                  {contact.relationship} · {contact.phone}
                </p>
              </div>
              {canEdit && (
                <ConfirmDelete label={`Remove ${contact.name}`} busy={busy} onConfirm={() => void remove(contact)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {alert}
      {canEdit && <AddContact url={url} onAdded={(contact) => changed([...contacts, contact])} />}
    </section>
  );
}

const NO_CONTACT = { name: "", phone: "", relationship: "" };

function AddContact({ url, onAdded }: { url: string; onAdded: (contact: EmergencyContactRow) => void }) {
  const [values, setValues] = useState(NO_CONTACT);
  const { error, errors, attempt, busy, run } = useSubmit();
  const set = (name: keyof typeof NO_CONTACT) => (value: string) => setValues({ ...values, [name]: value });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      onAdded(await postJson<EmergencyContactRow>(`${url}/contacts`, values));
      setValues(NO_CONTACT);
    });
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label="Add an emergency contact"
      className="space-y-4 rounded-control bg-ink/5 p-4"
    >
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-4 lg:grid-cols-3">
        <InputField
          id="contact-name"
          label="Name"
          required
          value={values.name}
          onChange={set("name")}
          error={errors.name}
        />
        <InputField
          id="contact-phone"
          label="Phone"
          type="tel"
          hint="Any Ghana number."
          required
          value={values.phone}
          onChange={set("phone")}
          error={errors.phone}
        />
        <InputField
          id="contact-relationship"
          label="Relationship"
          hint="For example Aunt."
          required
          value={values.relationship}
          onChange={set("relationship")}
          error={errors.relationship}
        />
      </div>
      <Button type="submit" disabled={busy}>
        Add contact
      </Button>
    </form>
  );
}

function PhotoSection({ url, pupil, canEdit, photo, onSaved }: SectionProps & { photo: string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const { act, busy, alert } = useAction();
  const note = pupil.has_photo
    ? ""
    : pupil.photo_on_file
      ? "A photo is on file. It shows only once photo consent is given; initials show until then."
      : "No photo yet. Initials show instead.";

  function upload() {
    if (!file) return;
    const body = new FormData();
    body.append("photo", file);
    void act(async () => {
      onSaved(await postForm<PupilDetail>(`${url}/photo`, body));
      setFile(null);
    });
  }

  const remove = () => act(async () => onSaved(await deleteJson<PupilDetail>(`${url}/photo`)));

  return (
    <section aria-labelledby="pupil-photo-title" className="space-y-3">
      <h2 id="pupil-photo-title" className="text-xl font-semibold">
        Photo
      </h2>
      <div className="flex flex-wrap items-center gap-4">
        <PersonPhoto src={photo} initials={pupil.initials} name={pupil.name} />
        {note && <p className="text-sm text-ink-muted">{note}</p>}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Choose a photo (JPEG, PNG or WebP)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1 block text-sm"
            />
          </label>
          <Button disabled={!file || busy} onClick={upload}>
            Upload photo
          </Button>
          {pupil.photo_on_file && (
            <Button variant="outline" disabled={busy} onClick={() => void remove()}>
              Remove photo
            </Button>
          )}
        </div>
      )}
      {alert}
    </section>
  );
}

function LoginSection({ url, pupil, canEdit, onSaved }: SectionProps) {
  const [password, setPassword] = useState<OneTimePassword | null>(null);
  const { act, busy, alert } = useAction();
  const issue = () =>
    act(async () => {
      const issued = await postJson<OneTimePassword>(`${url}/login`);
      setPassword(issued);
      onSaved({ ...pupil, login: issued.username });
    });
  return (
    <section aria-labelledby="pupil-login-title" className="space-y-3">
      <h2 id="pupil-login-title" className="text-xl font-semibold">
        Sign-in
      </h2>
      <p>
        {pupil.login
          ? `Signs in with their Student ID, ${pupil.login}.`
          : "No sign-in yet. Pupils from Basic 4 can sign in with their Student ID."}
      </p>
      {canEdit && (
        <Button variant="outline" disabled={busy} onClick={() => void issue()}>
          {pupil.login ? "Reset the password" : "Give a sign-in"}
        </Button>
      )}
      {alert}
      {password && <OneTimePasswordNote password={password} />}
    </section>
  );
}
