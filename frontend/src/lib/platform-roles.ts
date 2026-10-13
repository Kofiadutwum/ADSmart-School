/** The platform team's roles (business tools spec §2). The server enforces them; these only
 * decide which pages the admin area offers. */
export const OWNER = "Platform Owner";
export const FINANCE = "Platform Finance";
export const CONTENT = "Platform Content";
export const SUPPORT = "Platform Support";

export const TEAM_ROLES = [OWNER, FINANCE, CONTENT, SUPPORT] as const;
export const ROLE_LABELS: Record<string, string> = {
  [OWNER]: "Owner",
  [FINANCE]: "Finance",
  [CONTENT]: "Content",
  [SUPPORT]: "Support",
};

type HasRoles = { roles: readonly string[] };

/** The Owner can use everything; an item without roles is open to the whole team. */
export function canUse(me: HasRoles, roles?: readonly string[]): boolean {
  return !roles?.length || me.roles.includes(OWNER) || roles.some((role) => me.roles.includes(role));
}

export const ADMIN_NAV: { href: string; label: string; roles?: readonly string[] }[] = [
  { href: "/schools", label: "Schools", roles: [SUPPORT] },
  { href: "/leads", label: "Leads", roles: [SUPPORT] },
  { href: "/support", label: "Support", roles: [SUPPORT] },
  { href: "/announcements", label: "Announcements", roles: [SUPPORT] },
  { href: "/sms", label: "Texts", roles: [SUPPORT] },
  { href: "/billing", label: "Billing", roles: [FINANCE] },
  { href: "/statistics", label: "Statistics", roles: [FINANCE] },
  { href: "/website", label: "Website", roles: [CONTENT] },
  { href: "/team", label: "Team", roles: [OWNER] },
  { href: "/audit", label: "Audit log", roles: [OWNER] },
  { href: "/account", label: "Account" },
];

export function firstAllowedPath(me: HasRoles): string {
  return ADMIN_NAV.find((item) => canUse(me, item.roles))?.href ?? "/account";
}
