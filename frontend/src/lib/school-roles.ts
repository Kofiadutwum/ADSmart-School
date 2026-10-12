/** A school's roles and the screens each one has (Phase 1 spec §4.3, §7.2–7.3). The server
 * enforces access; this only decides which pages the portal offers. */
export const ADMINISTRATOR = "Administrator";
export const HEAD_TEACHER = "Head Teacher";
export const TEACHER = "Teacher";
export const CAREGIVER = "Early Years Caregiver";

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
  [TEACHER]: "/my-teaching",
  [CAREGIVER]: "/my-teaching",
};

type NavItem = { href: string; label: string; roles?: readonly string[] };

const SCHOOL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: [ADMINISTRATOR, HEAD_TEACHER] },
  { href: "/my-teaching", label: "My teaching", roles: [TEACHER, CAREGIVER] },
  { href: "/setup", label: "School setup", roles: [ADMINISTRATOR, HEAD_TEACHER] },
  { href: "/staff", label: "Staff", roles: [ADMINISTRATOR, HEAD_TEACHER] },
  { href: "/audit", label: "Audit log", roles: [ADMINISTRATOR, HEAD_TEACHER] },
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

export function canEdit(role: string | null): boolean {
  return role === ADMINISTRATOR;
}
