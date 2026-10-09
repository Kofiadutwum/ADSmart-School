export const NAV_ITEMS = [
  { href: "/about", label: "About" },
  { href: "/levels", label: "Levels" },
  { href: "/admissions", label: "Admissions" },
  { href: "/news", label: "News" },
  { href: "/contact", label: "Contact" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
