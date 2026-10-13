/** A school's roles and the screens each one has (Phase 1 spec §4.3, §7.2–7.3). The server
 * enforces access; this only decides which pages the portal offers. */
export const ADMINISTRATOR = "Administrator";
export const HEAD_TEACHER = "Head Teacher";
export const TEACHER = "Teacher";
export const CAREGIVER = "Early Years Caregiver";
export const PROPRIETOR = "Proprietor";
export const PARENT = "Parent";
export const STUDENT = "Student";

export const STAFF_ROLES = [
  "Accountant",
  ADMINISTRATOR,
  "Bookshop Keeper",
  "Canteen Officer",
  CAREGIVER,
  "Front Desk Officer",
  HEAD_TEACHER,
  "Proprietor",
  "School Nurse",
  TEACHER,
  "Transport Officer",
] as const;

/** Roles with screens of their own, in the order the switcher lists them. Others get Account. */
const HOMES: Record<string, string> = {
  [ADMINISTRATOR]: "/dashboard",
  [HEAD_TEACHER]: "/dashboard",
  [PROPRIETOR]: "/overview",
  [TEACHER]: "/my-teaching",
  [CAREGIVER]: "/my-teaching",
  [PARENT]: "/family",
  [STUDENT]: "/my-school",
};
const LEADERS = [ADMINISTRATOR, HEAD_TEACHER];

type NavItem = { href: string; label: string; roles?: readonly string[] };

const SCHOOL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: LEADERS },
  { href: "/overview", label: "Overview", roles: [PROPRIETOR] },
  { href: "/family", label: "Home", roles: [PARENT] },
  { href: "/wards", label: "My wards", roles: [PARENT] },
  { href: "/consent", label: "Consent", roles: [PARENT] },
  { href: "/my-school", label: "My school", roles: [STUDENT] },
  { href: "/my-teaching", label: "My classes", roles: [TEACHER, CAREGIVER] },
  { href: "/pupils", label: "Pupils", roles: LEADERS },
  { href: "/parents", label: "Parents", roles: LEADERS },
  { href: "/enrolment", label: "Enrolment", roles: [ADMINISTRATOR] },
  { href: "/setup", label: "School setup", roles: LEADERS },
  { href: "/staff", label: "Staff", roles: LEADERS },
  { href: "/audit", label: "Audit log", roles: LEADERS },
  { href: "/account", label: "Account" },
];

export function rolesWithScreens(roles: readonly string[]): string[] {
  return Object.keys(HOMES).filter((role) => roles.includes(role));
}

export function homeFor(role: string | null): string {
  return (role && HOMES[role]) ?? "/account";
}

export function navFor(role: string | null): { href: string; label: string }[] {
  return SCHOOL_NAV.filter((item) => !item.roles || (role !== null && item.roles.includes(role))).map(
    ({ href, label }) => ({ href, label }),
  );
}

/** Parents get a glass bottom tab bar on phones (Phase 1 spec §7.5). */
export function usesTabs(role: string | null): boolean {
  return role === PARENT;
}

export function canEdit(role: string | null): boolean {
  return role === ADMINISTRATOR;
}
