"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type PointerEvent } from "react";
import { LoadState, useLoad } from "@/components/portal/kit";
import { RichText } from "@/components/ui/rich-text";
import { putJson } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import type { ConsentRow, FamilyConsents, WardCard } from "@/lib/types";
import { PersonPhoto } from "./person-photo";
import { ConsentCard, initialsOf } from "./pupil-tabs";

const WARDS = "/api/parent/wards";
const CONSENTS = "/api/parent/consents";
const SWIPE = 40; // pixels before a swipe counts (P1 §8.5)
const EDGE = 24; // swipes never start this close to the screen's edges: the phone's back gesture
const NO_CHILDREN = "No children are linked to your account yet. Please contact the school.";

const unanswered = (consents: FamilyConsents) =>
  [...consents.wards.flatMap((ward) => ward.consents), ...consents.own].filter((row) => row.given === null).length;
const wardPhoto = (ward: WardCard) => (ward.has_photo ? `${WARDS}/${ward.id}/photo` : null);

/** A parent's home (Phase 1 spec §7.3): their children at a glance and what needs answering. */
export function FamilyHome() {
  const wards = useLoad<WardCard[]>(WARDS);
  const consents = useLoad<FamilyConsents>(CONSENTS);
  const open = consents.data ? unanswered(consents.data) : 0;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Welcome</h1>
      <LoadState
        error={wards.error}
        loading={!wards.data && !wards.error}
        empty={wards.data?.length === 0}
        emptyText={NO_CHILDREN}
      />
      {wards.data && wards.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {wards.data.map((ward) => (
            <li key={ward.id}>
              <Link
                href={`/wards?child=${ward.id}`}
                className="surface flex items-center gap-4 rounded-card p-4 shadow-elev-1 hover:ring-2 hover:ring-indigo/40"
              >
                <PersonPhoto src={wardPhoto(ward)} initials={ward.initials} name={ward.name} />
                <span>
                  <span className="block font-semibold">{ward.name}</span>
                  <span className="block text-sm text-ink-muted">{ward.class || "Not yet in a class"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open > 0 && (
        <p className="rounded-control bg-copper/15 p-4">
          {open === 1 ? "1 consent still to answer." : `${open} consents still to answer.`}{" "}
          <Link href="/consent" className="font-semibold text-indigo underline-offset-4 hover:underline">
            Answer them
          </Link>
        </p>
      )}
    </div>
  );
}

/** "My wards": one child at a time, chosen with name chips or a swipe (P1 §7.3, §8.5). */
export function WardsView() {
  const { data, error } = useLoad<WardCard[]>(WARDS);
  const wanted = Number(useSearchParams().get("child"));
  const [chosen, setChosen] = useState<number | null>(null);
  const start = useRef<number | null>(null);
  if (!data || data.length === 0) {
    return <LoadState error={error} loading={!data && !error} empty={data?.length === 0} emptyText={NO_CHILDREN} />;
  }
  const wards = data;
  const index =
    chosen ??
    Math.max(
      0,
      wards.findIndex((ward) => ward.id === wanted),
    );
  const ward = wards[index];

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    const nearEdge = event.clientX < EDGE || event.clientX > window.innerWidth - EDGE;
    start.current = nearEdge ? null : event.clientX;
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    if (start.current === null) return;
    const moved = event.clientX - start.current;
    start.current = null;
    if (Math.abs(moved) < SWIPE) return;
    setChosen((index + (moved < 0 ? 1 : -1) + wards.length) % wards.length);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">My wards</h1>
      {wards.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Choose a child" role="group">
          {wards.map((each, position) => (
            <button
              key={each.id}
              type="button"
              aria-pressed={position === index}
              onClick={() => setChosen(position)}
              className={cn(
                "press min-h-11 cursor-pointer rounded-full border border-line px-4 font-semibold",
                position === index ? "bg-indigo text-white" : "hover:bg-ink/5",
              )}
            >
              {each.first_name}
            </button>
          ))}
        </div>
      )}
      <section
        aria-labelledby={`ward-${ward.id}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="surface touch-pan-y space-y-5 rounded-card p-5 shadow-elev-1 select-none"
      >
        <div className="flex flex-wrap items-center gap-4">
          <PersonPhoto src={wardPhoto(ward)} initials={ward.initials} name={ward.name} size="lg" />
          <div>
            <h2 id={`ward-${ward.id}`} className="text-2xl font-semibold">
              {ward.name}
            </h2>
            <p className="text-ink-muted">Student ID {ward.student_id}</p>
            <p>{ward.class || "Not yet in a class"}</p>
            {ward.class_teacher && <p>Class teacher: {ward.class_teacher}</p>}
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold">Who can collect {ward.first_name}</h3>
          {ward.pickups.length === 0 ? (
            <p className="text-sm text-ink-muted">Nobody is listed yet.</p>
          ) : (
            <ul className="space-y-3">
              {ward.pickups.map((person) => (
                <li key={person.id} className="flex items-center gap-3">
                  <PersonPhoto
                    src={person.has_photo ? `/api/parent/pickups/${person.id}/photo` : null}
                    initials={initialsOf(person.name)}
                    name={person.name}
                    size="sm"
                  />
                  <span>
                    {person.name} ({person.relationship}) · {person.phone}
                    {person.valid_to && ` · until ${formatDate(person.valid_to)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-muted">To change who can collect your child, please contact the school.</p>
        </div>
      </section>
    </div>
  );
}

/** Consent (P1 §3.5, SMS spec §30): the school's privacy notice, then each answer. */
export function ConsentView() {
  const { data, setData, error } = useLoad<FamilyConsents>(CONSENTS);
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  const consents = data;

  function saved(student: number | null, row: ConsentRow) {
    const swap = (rows: ConsentRow[]) => rows.map((each) => (each.type === row.type ? row : each));
    setData({
      ...consents,
      wards: consents.wards.map((ward) => (ward.id === student ? { ...ward, consents: swap(ward.consents) } : ward)),
      own: student === null ? swap(consents.own) : consents.own,
    });
  }

  const answer = (student: number | null, type: string) => (given: boolean) =>
    putJson<ConsentRow>(CONSENTS, { student, type, given });

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Consent</h1>
      <section aria-labelledby="notice-title" className="surface space-y-3 rounded-card p-5 shadow-elev-1">
        {consents.notice ? (
          <>
            <h2 id="notice-title" className="text-xl font-semibold">
              {consents.notice.title}
            </h2>
            <p className="text-sm text-ink-muted">
              Version {consents.notice.version}, in force from {formatDate(consents.notice.effective_from)}
            </p>
            <RichText text={consents.notice.body} />
          </>
        ) : (
          <>
            <h2 id="notice-title" className="text-xl font-semibold">
              Privacy notice
            </h2>
            <p>The school is preparing its privacy notice. You can still answer below.</p>
          </>
        )}
      </section>
      {consents.wards.map((ward) => (
        <section key={ward.id} aria-labelledby={`consents-${ward.id}`} className="space-y-3">
          <h2 id={`consents-${ward.id}`} className="text-xl font-semibold">
            {ward.name}
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {ward.consents.map((row) => (
              <li key={row.type}>
                <ConsentCard
                  row={row}
                  canEdit
                  idPrefix={`consent-${ward.id}`}
                  onAnswer={answer(ward.id, row.type)}
                  onSaved={(next) => saved(ward.id, next)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="consents-own" className="space-y-3">
        <h2 id="consents-own" className="text-xl font-semibold">
          Messages to you
        </h2>
        <p className="text-sm text-ink-muted">
          Safety, security and payment messages are always sent, whatever you choose here.
        </p>
        <ul className="grid gap-4 lg:grid-cols-2">
          {consents.own.map((row) => (
            <li key={row.type}>
              <ConsentCard
                row={row}
                canEdit
                idPrefix="consent-own"
                onAnswer={answer(null, row.type)}
                onSaved={(next) => saved(null, next)}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
