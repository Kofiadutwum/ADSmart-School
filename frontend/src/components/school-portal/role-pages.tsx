"use client";

import { useSearchParams } from "next/navigation";
import { canEdit } from "@/lib/school-roles";
import { CalendarView } from "./calendar-view";
import { ClassesView } from "./classes-view";
import { ParentsView } from "./parents-view";
import { ProfileForm } from "./profile-form";
import { PupilDetailView } from "./pupil-detail";
import { PupilsView } from "./pupils-view";
import { useActiveRole } from "./school-portal-shell";
import { StaffDetailView } from "./staff-detail";
import { StaffView } from "./staff-view";
import { SubjectsView } from "./subjects-view";
import { TeachingView } from "./teaching-view";
import { YearsView } from "./years-view";

const MONTH = /^\d{4}-\d{2}$/;

/** Page bodies that change with the active role: the Administrator edits, the Head Teacher
 * reads (Phase 1 spec §4.3). The server enforces the same rule. */
function useCanEdit(): boolean {
  return canEdit(useActiveRole());
}

export function ProfileSetup() {
  return <ProfileForm canEdit={useCanEdit()} />;
}

export function YearsSetup() {
  return <YearsView canEdit={useCanEdit()} />;
}

export function CalendarSetup() {
  const month = useSearchParams().get("month"); // a link can open a given month, e.g. ?month=2026-12
  return <CalendarView canEdit={useCanEdit()} initialMonth={month && MONTH.test(month) ? month : undefined} />;
}

export function ClassesSetup() {
  return <ClassesView canEdit={useCanEdit()} />;
}

export function SubjectsSetup() {
  return <SubjectsView canEdit={useCanEdit()} />;
}

export function TeachingSetup() {
  return <TeachingView canEdit={useCanEdit()} />;
}

export function StaffPage() {
  return <StaffView canEdit={useCanEdit()} />;
}

export function StaffMemberPage({ id }: { id: number }) {
  return <StaffDetailView id={id} canEdit={useCanEdit()} />;
}

export function PupilsPage() {
  return <PupilsView canEdit={useCanEdit()} />;
}

export function PupilPage({ id }: { id: number }) {
  return <PupilDetailView id={id} canEdit={useCanEdit()} />;
}

export function ParentsPage() {
  return <ParentsView canEdit={useCanEdit()} />;
}
