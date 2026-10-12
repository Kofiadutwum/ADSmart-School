"use client";

import { canEdit } from "@/lib/school-roles";
import { CalendarView } from "./calendar-view";
import { ClassesView } from "./classes-view";
import { ProfileForm } from "./profile-form";
import { useActiveRole } from "./school-portal-shell";
import { SubjectsView } from "./subjects-view";
import { TeachingView } from "./teaching-view";
import { YearsView } from "./years-view";

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
  return <CalendarView canEdit={useCanEdit()} />;
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
