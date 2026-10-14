/** A school's roles and the screens each one has (Phase 1 spec §4.3, §7.2–7.3; SMS spec §2). The
 * server enforces access; this only decides which pages the portal offers. */
export const ADMINISTRATOR = "Administrator";
export const HEAD_TEACHER = "Head Teacher";
export const TEACHER = "Teacher";
export const CAREGIVER = "Early Years Caregiver";
export const PROPRIETOR = "Proprietor";
export const ACCOUNTANT = "Accountant";
export const FRONT_DESK = "Front Desk Officer";
export const NURSE = "School Nurse";
export const BOOKSHOP = "Bookshop Keeper";
export const CANTEEN = "Canteen Officer";
export const TRANSPORT = "Transport Officer";
export const PARENT = "Parent";
export const STUDENT = "Student";

export const STAFF_ROLES = [
  ACCOUNTANT,
  ADMINISTRATOR,
  BOOKSHOP,
  CANTEEN,
  CAREGIVER,
  FRONT_DESK,
  HEAD_TEACHER,
  PROPRIETOR,
  NURSE,
  TEACHER,
  TRANSPORT,
] as const;

/** Every role's home, in the order the switcher lists them. */
const HOMES: Record<string, string> = {
  [ADMINISTRATOR]: "/dashboard",
  [HEAD_TEACHER]: "/dashboard",
  [PROPRIETOR]: "/overview",
  [ACCOUNTANT]: "/money",
  [TEACHER]: "/my-teaching",
  [CAREGIVER]: "/my-teaching",
  [FRONT_DESK]: "/gate",
  [NURSE]: "/health",
  [BOOKSHOP]: "/shop",
  [CANTEEN]: "/daily-charges",
  [TRANSPORT]: "/transport",
  [PARENT]: "/family",
  [STUDENT]: "/my-school",
};
const LEADERS = [ADMINISTRATOR, HEAD_TEACHER];
const MONEY = [ACCOUNTANT, ADMINISTRATOR, HEAD_TEACHER, PROPRIETOR];
const TEACHING = [TEACHER, CAREGIVER];
const ALL_STAFF = [...STAFF_ROLES];

/** `roles`: only these see it; `except`: everyone but these. */
type NavItem = { href: string; label: string; roles?: readonly string[]; except?: readonly string[]; group?: string };

const SCHOOL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: LEADERS },
  { href: "/overview", label: "Overview", roles: [PROPRIETOR] },
  { href: "/family", label: "Home", roles: [PARENT] },
  { href: "/wards", label: "My wards", roles: [PARENT] },
  { href: "/payments", label: "Payments", roles: [PARENT] },
  { href: "/consent", label: "Consent", roles: [PARENT] },
  { href: "/more", label: "More", roles: [PARENT] },
  { href: "/my-school", label: "My school", roles: [STUDENT] },
  { href: "/my-results", label: "Results", roles: [STUDENT] },
  { href: "/my-quizzes", label: "Quizzes", roles: [STUDENT] },
  { href: "/my-timetable", label: "Timetable", roles: [STUDENT] },
  { href: "/my-resources", label: "Resources", roles: [STUDENT] },
  { href: "/my-teaching", label: "My classes", roles: TEACHING },
  { href: "/pupils", label: "Pupils", roles: LEADERS, group: "People" },
  { href: "/parents", label: "Parents", roles: LEADERS, group: "People" },
  { href: "/enrolment", label: "Enrolment", roles: [ADMINISTRATOR], group: "People" },
  { href: "/staff", label: "Staff", roles: LEADERS, group: "People" },
  { href: "/import", label: "Import", roles: [ADMINISTRATOR], group: "People" },
  { href: "/leave", label: "Leave", roles: ALL_STAFF, group: "People" },
  { href: "/register", label: "Attendance", roles: [...LEADERS, ...TEACHING, FRONT_DESK], group: "Learning" },
  { href: "/marks", label: "Marks", roles: [TEACHER], group: "Learning" },
  { href: "/results", label: "Results", roles: LEADERS, group: "Learning" },
  { href: "/lesson-notes", label: "Lesson notes", roles: [...LEADERS, ...TEACHING], group: "Learning" },
  { href: "/timetable", label: "Timetable", roles: [...LEADERS, ...TEACHING], group: "Learning" },
  { href: "/resources", label: "Resources", roles: [...LEADERS, ...TEACHING], group: "Learning" },
  { href: "/quizzes", label: "Quizzes", roles: [TEACHER], group: "Learning" },
  { href: "/daily-care", label: "Daily care", roles: [...TEACHING, ...LEADERS], group: "Learning" },
  { href: "/money", label: "Money", roles: MONEY, group: "Money" },
  { href: "/daily-charges", label: "Daily charges", roles: [...MONEY, CANTEEN, TEACHER], group: "Money" },
  { href: "/billing", label: "Billing", roles: [ADMINISTRATOR, PROPRIETOR, ACCOUNTANT], group: "Money" },
  { href: "/gate", label: "Gate", roles: [FRONT_DESK, ...LEADERS], group: "Services" },
  { href: "/health", label: "Health", roles: [NURSE, ...LEADERS], group: "Services" },
  { href: "/transport", label: "Transport", roles: [TRANSPORT, ...LEADERS], group: "Services" },
  { href: "/shop", label: "Shop", roles: [BOOKSHOP, ACCOUNTANT, ...LEADERS], group: "Services" },
  { href: "/messages", label: "Messages", roles: LEADERS, group: "School" },
  { href: "/website", label: "Website", roles: LEADERS, group: "School" },
  { href: "/setup", label: "School setup", roles: LEADERS, group: "School" },
  { href: "/support", label: "Support", roles: LEADERS, group: "School" },
  { href: "/year-end", label: "Year end", roles: LEADERS, group: "School" },
  { href: "/reports", label: "Reports", roles: [...LEADERS, PROPRIETOR, ACCOUNTANT], group: "School" },
  { href: "/audit", label: "Audit log", roles: LEADERS, group: "School" },
  { href: "/account", label: "Account", except: [PARENT] },
];

export function rolesWithScreens(roles: readonly string[]): string[] {
  return Object.keys(HOMES).filter((role) => roles.includes(role));
}

export function homeFor(role: string | null): string {
  return (role && HOMES[role]) ?? "/account";
}

export function navFor(role: string | null): { href: string; label: string; group?: string }[] {
  return SCHOOL_NAV.filter((item) =>
    item.roles ? role !== null && item.roles.includes(role) : !(role !== null && item.except?.includes(role)),
  ).map(
    ({ href, label, group }) => (group ? { href, label, group } : { href, label }),
  );
}

/** Parents get a glass bottom tab bar on phones (Phase 1 spec §7.5). */
export function usesTabs(role: string | null): boolean {
  return role === PARENT;
}

/** The Administrator changes the school's setup; others read it. */
export function canEdit(role: string | null): boolean {
  return role === ADMINISTRATOR;
}

/** Whether the active role is one of these. */
export function isRole(role: string | null, ...names: string[]): boolean {
  return role !== null && names.includes(role);
}
