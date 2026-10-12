"use client";

import { canEdit } from "@/lib/school-roles";
import { CalendarView } from "./calendar-view";
import { ProfileForm } from "./profile-form";
import { useActiveRole } from "./school-portal-shell";
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
