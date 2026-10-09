import type { Me } from "./types";

/** +233241234567 → 024 123 4567 (spec §3.4). */
export function formatPhoneLocal(e164: string): string {
  if (!/^\+233\d{9}$/.test(e164)) return e164;
  const local = `0${e164.slice(4)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** 2601473 → 26-0147-3 (spec §3.3). */
export function formatStudentId(id: string): string {
  return /^\d{7}$/.test(id) ? `${id.slice(0, 2)}-${id.slice(2, 6)}-${id.slice(6)}` : id;
}

export function formatIdentifier(me: Pick<Me, "kind" | "username">): string {
  if (me.kind === "parent") return formatPhoneLocal(me.username);
  if (me.kind === "student") return formatStudentId(me.username);
  return me.username;
}
