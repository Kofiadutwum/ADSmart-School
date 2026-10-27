"use client";

import { useState, type FormEvent } from "react";
import {
  CHECK_FORM,
  ConfirmDelete,
  InputField,
  LoadState,
  NOTICE_TICK_ERROR,
  NoticeTick,
  Tick,
  useAction,
  useLoad,
  useSubmit,
} from "@/components/portal/kit";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, getJson, patchJson, postForm, postJson, putJson } from "@/lib/client-api";
import { formatDate, formatDateTime, todayInAccra } from "@/lib/dates";
import type {
  ActivationResult,
  ConsentRow,
  GuardianRow,
  HistoryEntry,
  ParentRow,
  PickupRow,
  PlaceRow,
  PupilDetail,
  Relationship,
} from "@/lib/types";
import { PersonPhoto } from "./person-photo";

export const RELATIONSHIPS: Record<Relationship, string> = {
  MOTHER: "Mother",
  FATHER: "Father",
  GUARDIAN: "Guardian",
  OTHER: "Other",
};
const pupilUrl = (pupil: PupilDetail) => `/api/school/pupils/${pupil.id}`;

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** What an activation text came to, in words (demo numbers are never texted, P1 §9). */
export function activationMessage(result: ActivationResult): string {
  if (result.sent) return "Activation text sent.";
  return result.reason === "demo"
    ? "Not sent: demo numbers are never texted."
    : "The text could not be sent. Try again later.";
}

type TabProps = { pupil: PupilDetail; canEdit: boolean };

/** The pupil's parents and guardians, with the parent's sign-in (P1 §5.2, §7.2). */
export function ParentsTab({ pupil, canEdit }: TabProps) {
  const { data, setData, error } = useLoad<GuardianRow[]>(`${pupilUrl(pupil)}/guardians`);
  const rows = data ?? [];

  function saved(row: GuardianRow) {
    const others = rows
      .filter((each) => each.id !== row.id)
      .map((each) => (row.is_primary_contact ? { ...each, is_primary_contact: false } : each));
    setData([...others, row].sort((a, b) => a.name.localeCompare(b.name)));
  }

  return (
    <div className="space-y-6 pt-4">
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No parents linked yet." />
      <ul className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id}>
            <GuardianCard
              row={row}
              canEdit={canEdit}
              onSaved={saved}
              onRemoved={() => setData(rows.filter((each) => each.id !== row.id))}
            />
          </li>
        ))}
      </ul>
      {canEdit && <LinkExisting pupil={pupil} onLinked={saved} />}
      {canEdit && <AddParent pupil={pupil} onAdded={saved} />}
    </div>
  );
}

type CardProps = {
  row: GuardianRow;
  canEdit: boolean;
  onSaved: (row: GuardianRow) => void;
  onRemoved: () => void;
};

function GuardianCard({ row, canEdit, onSaved, onRemoved }: CardProps) {
  const { act, busy, alert } = useAction();
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const titleId = `guardian-${row.id}`;
  const parentUrl = `/api/school/parents/${row.parent}`;
  const linkUrl = `/api/school/guardians/${row.id}`;
  const details = [
    RELATIONSHIPS[row.relationship],
    row.phone,
    row.is_payer && "Pays fees",
    row.is_primary_contact && "Main contact",
  ].filter(Boolean);

  const flag = (name: "is_payer" | "is_primary_contact", value: boolean) =>
    act(async () => onSaved(await patchJson<GuardianRow>(linkUrl, { [name]: value })));
  const activate = () =>
    act(async () => setNotice(activationMessage(await postJson<ActivationResult>(`${parentUrl}/activation`))));
  const reset = () =>
    act(async () => {
      const result = await postJson<ActivationResult>(`${parentUrl}/reset`);
      setResetting(false);
      setNotice(`Access reset: they are signed out. ${activationMessage(result)}`);
    });
  const unlink = () =>
    act(async () => {
      await deleteJson(linkUrl);
      onRemoved();
    });

  return (
    <article aria-labelledby={titleId} className="surface space-y-3 rounded-card p-5 shadow-elev-1">
      <h3 id={titleId} className="text-lg font-semibold">
        {row.name}
      </h3>
      <p className="text-sm text-ink-muted">{details.join(" · ")}</p>
      <p className="text-sm">
        {row.activated ? "Activated" : "Not activated yet"}
        {row.is_demo && " · Demo"}
      </p>
      {canEdit && (
        <>
          <div className="flex flex-wrap gap-x-6">
            <Tick label="Pays fees" checked={row.is_payer} onChange={(value) => void flag("is_payer", value)} />
            <Tick
              label="Main contact"
              checked={row.is_primary_contact}
              onChange={(value) => void flag("is_primary_contact", value)}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled={busy} onClick={() => void activate()}>
              Send activation text
            </Button>
            {resetting ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span>Sign them out and text a new activation code?</span>
                <Button disabled={busy} onClick={() => void reset()}>
                  Yes, reset
                </Button>
                <Button variant="outline" onClick={() => setResetting(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button variant="outline" onClick={() => setResetting(true)}>
                Reset access
              </Button>
            )}
            <ConfirmDelete label="Unlink" busy={busy} onConfirm={() => void unlink()} />
          </div>
        </>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {alert}
    </article>
  );
}

type RelationshipProps = { id: string; value: string; onChange: (value: Relationship) => void };

function RelationshipSelect({ id, value, onChange }: RelationshipProps) {
  return (
    <Field id={id} label="Relationship" required>
      {(props) => (
        <select
          {...props}
          value={value}
          onChange={(event) => onChange(event.target.value as Relationship)}
          className={inputClasses}
        >
          {Object.entries(RELATIONSHIPS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function LinkExisting({ pupil, onLinked }: { pupil: PupilDetail; onLinked: (row: GuardianRow) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ParentRow[] | null>(null);
  const [relationship, setRelationship] = useState<Relationship>("MOTHER");
  const { act, busy, alert } = useAction();

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const words = query.trim();
    if (!words) return;
    void act(async () => setFound(await getJson<ParentRow[]>(`/api/school/parents?q=${encodeURIComponent(words)}`)));
  }

  const link = (parent: ParentRow) =>
    act(async () => {
      const body = { parent: parent.id, relationship };
      onLinked(await postJson<GuardianRow>(`${pupilUrl(pupil)}/guardians`, body));
      setFound(null);
      setQuery("");
    });

  return (
    <section aria-labelledby="link-parent-title" className="space-y-3 rounded-control bg-ink/5 p-4">
      <h3 id="link-parent-title" className="font-semibold">
        Link an existing parent
      </h3>
      <form noValidate onSubmit={onSearch} aria-label="Find a parent" className="flex flex-wrap items-end gap-3">
        <InputField id="link-query" label="Name or mobile number" value={query} onChange={setQuery} />
        <RelationshipSelect id="link-relationship" value={relationship} onChange={setRelationship} />
        <Button type="submit" disabled={busy}>
          Find
        </Button>
      </form>
      {found && found.length === 0 && <p className="text-sm text-ink-muted">No parent matches. Add them below.</p>}
      {found && found.length > 0 && (
        <ul className="divide-y divide-line">
          {found.map((parent) => (
            <li key={parent.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                {parent.name} · {parent.phone}
              </span>
              <Button variant="outline" disabled={busy} onClick={() => void link(parent)}>
                Link {parent.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {alert}
    </section>
  );
}

const NEW_PARENT = { title: "", first_name: "", surname: "", phone: "", alt_phone: "", email: "" };

function AddParent({ pupil, onAdded }: { pupil: PupilDetail; onAdded: (row: GuardianRow) => void }) {
  const [values, setValues] = useState(NEW_PARENT);
  const [relationship, setRelationship] = useState<Relationship>("MOTHER");
  const [payer, setPayer] = useState(false);
  const [primary, setPrimary] = useState(false);
  const [informed, setInformed] = useState(false);
  const { error, errors, attempt, busy, run, fail } = useSubmit();
  const set = (name: keyof typeof NEW_PARENT) => (value: string) => setValues({ ...values, [name]: value });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!informed) return fail(CHECK_FORM, { privacy_notice_given: NOTICE_TICK_ERROR });
    const link = { student: pupil.id, relationship, is_payer: payer, is_primary_contact: primary };
    void run(async () => {
      const body = { ...values, link, privacy_notice_given: informed };
      const parent = await postJson<ParentRow>("/api/school/parents", body);
      const child = parent.children.find((each) => each.student === pupil.id);
      if (child) {
        onAdded({
          id: child.guardianship,
          parent: parent.id,
          name: parent.name,
          phone: parent.phone,
          relationship: child.relationship,
          is_payer: child.is_payer,
          is_primary_contact: child.is_primary_contact,
          activated: parent.activated,
          is_demo: parent.is_demo,
        });
      }
      setValues(NEW_PARENT);
    });
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="add-parent-title"
      className="space-y-4 rounded-control bg-ink/5 p-4"
    >
      <h3 id="add-parent-title" className="font-semibold">
        Add a new parent
      </h3>
      <p className="text-sm text-ink-muted">
        Their mobile number becomes their sign-in. Send the activation text after.
      </p>
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-4 lg:grid-cols-3">
        <InputField
          id="parent-title"
          label="Title"
          hint="For example Mrs."
          value={values.title}
          onChange={set("title")}
        />
        <InputField
          id="parent-first"
          label="First name"
          required
          value={values.first_name}
          onChange={set("first_name")}
          error={errors.first_name}
        />
        <InputField
          id="parent-surname"
          label="Surname"
          required
          value={values.surname}
          onChange={set("surname")}
          error={errors.surname}
        />
        <InputField
          id="parent-phone"
          label="Mobile number"
          type="tel"
          required
          value={values.phone}
          onChange={set("phone")}
          error={errors.phone}
        />
        <InputField
          id="parent-alt"
          label="Other phone"
          type="tel"
          value={values.alt_phone}
          onChange={set("alt_phone")}
          error={errors.alt_phone}
        />
        <InputField
          id="parent-email"
          label="Email"
          type="email"
          value={values.email}
          onChange={set("email")}
          error={errors.email}
        />
        <RelationshipSelect id="parent-relationship" value={relationship} onChange={setRelationship} />
      </div>
      <div className="flex flex-wrap gap-x-6">
        <Tick label="Pays fees" checked={payer} onChange={setPayer} />
        <Tick label="Main contact" checked={primary} onChange={setPrimary} />
      </div>
      <NoticeTick
        label="This parent has been given the school's privacy notice."
        checked={informed}
        onChange={setInformed}
        error={errors.privacy_notice_given}
      />
      <Button type="submit" disabled={busy}>
        Add parent
      </Button>
    </form>
  );
}

/** People allowed to collect the pupil, with photo and validity dates (P1 §3.2). */
export function PickupsTab({ pupil, canEdit }: TabProps) {
  const { data, setData, error } = useLoad<PickupRow[]>(`${pupilUrl(pupil)}/pickups`);
  const rows = data ?? [];

  function replace(row: PickupRow) {
    const known = rows.some((each) => each.id === row.id);
    setData(known ? rows.map((each) => (each.id === row.id ? row : each)) : [row, ...rows]);
  }

  return (
    <div className="space-y-6 pt-4">
      <LoadState
        error={error}
        loading={!data && !error}
        empty={rows.length === 0}
        emptyText="No pick-up persons yet."
      />
      <ul className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id}>
            <PickupCard row={row} canEdit={canEdit} onSaved={replace} />
          </li>
        ))}
      </ul>
      {canEdit && <PickupForm pupil={pupil} onSaved={replace} />}
    </div>
  );
}

type PickupCardProps = { row: PickupRow; canEdit: boolean; onSaved: (row: PickupRow) => void };

function PickupCard({ row, canEdit, onSaved }: PickupCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState(0);
  const { act, busy, alert } = useAction();
  const url = `/api/school/pickups/${row.id}`;
  const titleId = `pickup-${row.id}`;

  function upload() {
    if (!file) return;
    const body = new FormData();
    body.append("photo", file);
    void act(async () => {
      onSaved(await postForm<PickupRow>(`${url}/photo`, body));
      setVersion((each) => each + 1);
      setFile(null);
    });
  }

  const end = () => act(async () => onSaved(await postJson<PickupRow>(`${url}/end`)));

  return (
    <article aria-labelledby={titleId} className="surface space-y-3 rounded-card p-5 shadow-elev-1">
      <div className="flex items-center gap-4">
        <PersonPhoto
          src={row.has_photo ? `${url}/photo?v=${version}` : null}
          initials={initialsOf(row.name)}
          name={row.name}
        />
        <div>
          <h3 id={titleId} className="text-lg font-semibold">
            {row.name}
          </h3>
          <p className="text-sm text-ink-muted">
            {row.relationship} · {row.phone}
          </p>
        </div>
      </div>
      <p className="text-sm">
        Allowed from {row.valid_from}
        {row.valid_to ? ` until ${row.valid_to}` : ", with no end date"}
        {!row.is_current && " · No longer allowed"}
      </p>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-3">
          {row.is_current && (
            <Button variant="outline" disabled={busy} onClick={() => void end()}>
              End
            </Button>
          )}
          <label className="text-sm font-medium">
            Photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1 block text-sm"
            />
          </label>
          <Button variant="outline" disabled={!file || busy} onClick={upload}>
            Upload photo
          </Button>
        </div>
      )}
      {alert}
    </article>
  );
}

const NEW_PICKUP = { name: "", phone: "", relationship: "", valid_from: "", valid_to: "" };

function PickupForm({ pupil, onSaved }: { pupil: PupilDetail; onSaved: (row: PickupRow) => void }) {
  const [values, setValues] = useState({ ...NEW_PICKUP, valid_from: todayInAccra() });
  const { error, errors, attempt, busy, run } = useSubmit();
  const set = (name: keyof typeof NEW_PICKUP) => (value: string) => setValues({ ...values, [name]: value });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { ...values, valid_to: values.valid_to || null };
    void run(async () => {
      onSaved(await postJson<PickupRow>(`${pupilUrl(pupil)}/pickups`, body));
      setValues({ ...NEW_PICKUP, valid_from: todayInAccra() });
    });
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="add-pickup-title"
      className="space-y-4 rounded-control bg-ink/5 p-4"
    >
      <h3 id="add-pickup-title" className="font-semibold">
        Add a pick-up person
      </h3>
      <FormAlert message={error} focusKey={attempt} />
      <div className="grid gap-4 lg:grid-cols-3">
        <InputField
          id="pickup-name"
          label="Name"
          required
          value={values.name}
          onChange={set("name")}
          error={errors.name}
        />
        <InputField
          id="pickup-phone"
          label="Mobile number"
          type="tel"
          required
          value={values.phone}
          onChange={set("phone")}
          error={errors.phone}
        />
        <InputField
          id="pickup-relationship"
          label="Relationship"
          hint="For example Uncle or Driver."
          required
          value={values.relationship}
          onChange={set("relationship")}
          error={errors.relationship}
        />
        <InputField
          id="pickup-from"
          label="Allowed from"
          type="date"
          required
          value={values.valid_from}
          onChange={set("valid_from")}
          error={errors.valid_from}
        />
        <InputField
          id="pickup-to"
          label="Until"
          type="date"
          value={values.valid_to}
          onChange={set("valid_to")}
          error={errors.valid_to}
        />
      </div>
      <Button type="submit" disabled={busy}>
        Add
      </Button>
    </form>
  );
}

/** The pupil's places, newest first; history is never overwritten (P1 §7.2). */
export function ClassHistoryTab({ pupil }: { pupil: PupilDetail }) {
  const { data, error } = useLoad<PlaceRow[]>(`${pupilUrl(pupil)}/enrolments`);
  return (
    <div className="space-y-4 pt-4">
      <LoadState
        error={error}
        loading={!data && !error}
        empty={data?.length === 0}
        emptyText="Not placed in a class yet."
      />
      {data && data.length > 0 && (
        <ul className="surface divide-y divide-line rounded-card shadow-elev-1">
          {data.map((place) => (
            <li key={place.id} className="p-4">
              <p className="font-semibold">
                {place.class}, {place.year}
              </p>
              <p className="text-sm text-ink-muted">
                From {place.start_date}
                {place.end_date ? ` to ${place.end_date}` : " (current place)"}
                {place.outcome && ` · ${place.outcome}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Consents by type, recorded against the privacy notice in force (P1 §3.5). */
export function ConsentsTab({ pupil, canEdit }: TabProps) {
  const url = `${pupilUrl(pupil)}/consents`;
  const { data, setData, error } = useLoad<ConsentRow[]>(url);
  const replace = (row: ConsentRow) => setData((data ?? []).map((each) => (each.type === row.type ? row : each)));
  return (
    <div className="space-y-4 pt-4">
      <LoadState error={error} loading={!data && !error} empty={false} emptyText="" />
      <ul className="grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((row) => (
          <li key={row.type}>
            <ConsentCard
              row={row}
              canEdit={canEdit}
              onAnswer={(given) => putJson<ConsentRow>(`${url}/${row.type}`, { given })}
              onSaved={replace}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

type ConsentCardProps = {
  row: ConsentRow;
  canEdit: boolean;
  onAnswer: (given: boolean) => Promise<ConsentRow>;
  onSaved: (row: ConsentRow) => void;
  idPrefix?: string;
};

/** One consent, its answer in words, and Given / Withdrawn buttons. Shared with parents. */
export function ConsentCard({ row, canEdit, onAnswer, onSaved, idPrefix = "consent" }: ConsentCardProps) {
  const { act, busy, alert } = useAction();
  const titleId = `${idPrefix}-${row.type}`;
  const state =
    row.given === null
      ? "Not asked yet"
      : row.given
        ? `Given on ${row.given_at ? formatDate(row.given_at) : "an earlier date"}`
        : `Withdrawn on ${row.withdrawn_at ? formatDate(row.withdrawn_at) : "an earlier date"}`;
  return (
    <article aria-labelledby={titleId} className="surface space-y-3 rounded-card p-5 shadow-elev-1">
      <h3 id={titleId} className="font-semibold">
        {row.label}
      </h3>
      <p>{state}</p>
      {row.notice_version && (
        <p className="text-sm text-ink-muted">Recorded under privacy notice version {row.notice_version}.</p>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-3">
          {[true, false].map((given) => (
            <Button
              key={String(given)}
              variant={row.given === given ? "primary" : "outline"}
              aria-pressed={row.given === given}
              disabled={busy}
              onClick={() => void act(async () => onSaved(await onAnswer(given)))}
            >
              {given ? "Given" : "Withdrawn"}
            </Button>
          ))}
        </div>
      )}
      {alert}
    </article>
  );
}

function describeChange(entry: HistoryEntry): string {
  const keys = [...new Set([...Object.keys(entry.old ?? {}), ...Object.keys(entry.new ?? {})])];
  const parts = keys.map((key) => {
    const before = entry.old?.[key];
    const after = entry.new?.[key];
    if (before === undefined) return `${key}: ${String(after)}`;
    if (after === undefined) return `${key}: ${String(before)} (removed)`;
    return `${key}: ${String(before)} → ${String(after)}`;
  });
  const text = parts.join("; ");
  return entry.reason ? `${text}. ${entry.reason}` : text;
}

/** Every change to the pupil and their family, places and consents (P1 §7.2, §11.3). */
export function ChangesTab({ pupil }: { pupil: PupilDetail }) {
  const { data, error } = useLoad<HistoryEntry[]>(`${pupilUrl(pupil)}/history`);
  return (
    <div className="space-y-4 pt-4">
      <LoadState error={error} loading={!data && !error} empty={data?.length === 0} emptyText="No changes recorded." />
      {data && data.length > 0 && (
        <div className="surface overflow-x-auto rounded-card shadow-elev-1">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-muted">
              <tr>
                {["When", "Who", "What", "Details"].map((heading) => (
                  <th key={heading} scope="col" className="p-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((entry) => (
                <tr key={entry.id}>
                  <td className="p-3 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
                  <td className="p-3">{entry.actor_name || "The system"}</td>
                  <td className="p-3">{entry.action_label}</td>
                  <td className="p-3">{describeChange(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
