export type Category = "early_years" | "primary" | "jhs";

export const CATEGORY_LABEL: Record<Category, string> = {
  early_years: "Early Years",
  primary: "Primary",
  jhs: "JHS",
};

/** Same codes as the backend's Enquiry.Level and level_<code>_* content blocks. */
export type LevelCode = "creche" | "nursery" | "kg" | "lower_primary" | "upper_primary" | "jhs";

export const LEVELS: { code: LevelCode; name: string; shortName: string; category: Category }[] = [
  { code: "creche", name: "Crèche", shortName: "Crèche", category: "early_years" },
  { code: "nursery", name: "Nursery", shortName: "Nursery", category: "early_years" },
  { code: "kg", name: "Kindergarten (KG1–KG2)", shortName: "KG", category: "early_years" },
  { code: "lower_primary", name: "Lower Primary (Basic 1–3)", shortName: "Basic 1–3", category: "primary" },
  { code: "upper_primary", name: "Upper Primary (Basic 4–6)", shortName: "Basic 4–6", category: "primary" },
  { code: "jhs", name: "Junior High School (JHS 1–3)", shortName: "JHS", category: "jhs" },
];

export type Level = (typeof LEVELS)[number];

/** The levels a school teaches, in school order (amendment §7.1). */
export function offeredLevels(codes: readonly string[]): Level[] {
  return LEVELS.filter((level) => codes.includes(level.code));
}

export function levelsTitle(levels: Level[]): string {
  if (levels.length === 0) return "Our levels";
  const first = levels[0];
  const last = levels[levels.length - 1];
  return first === last ? first.name : `From ${first.shortName} to ${last.shortName}`;
}
