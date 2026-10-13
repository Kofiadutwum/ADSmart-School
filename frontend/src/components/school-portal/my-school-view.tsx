"use client";

import Link from "next/link";
import { LoadState, useLoad } from "@/components/portal/kit";
import type { PupilMe } from "@/lib/types";
import { PersonPhoto } from "./person-photo";

/** A pupil's home from Basic 4 (Phase 1 spec §7.3): their profile, class and account. */
export function MySchoolView() {
  const { data, error } = useLoad<PupilMe>("/api/student/me");
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Hello, {data.first_name}</h1>
      <section
        aria-label="My details"
        className="surface flex flex-wrap items-center gap-5 rounded-card p-5 shadow-elev-1"
      >
        <PersonPhoto
          src={data.has_photo ? "/api/student/photo" : null}
          initials={data.initials}
          name={data.name}
          size="lg"
        />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-muted">Name</dt>
          <dd className="font-semibold">{data.name}</dd>
          <dt className="text-ink-muted">Class</dt>
          <dd>{data.class || "Not yet in a class"}</dd>
          <dt className="text-ink-muted">Class teacher</dt>
          <dd>{data.class_teacher ?? "Not chosen yet"}</dd>
        </dl>
        <p className="w-full text-sm text-ink-muted">Student ID {data.student_id}</p>
      </section>
      <p>
        <Link href="/account" className="font-semibold text-indigo underline-offset-4 hover:underline">
          Change your password and see where you are signed in
        </Link>
      </p>
    </div>
  );
}
