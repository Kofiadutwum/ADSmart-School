"use client";

import { canEdit } from "@/lib/school-roles";
import { ProfileForm } from "./profile-form";
import { useActiveRole } from "./school-portal-shell";

/** Page bodies that change with the active role: the Administrator edits, the Head Teacher
 * reads (Phase 1 spec §4.3). The server enforces the same rule. */
function useCanEdit(): boolean {
  return canEdit(useActiveRole());
}

export function ProfileSetup() {
  return <ProfileForm canEdit={useCanEdit()} />;
}
