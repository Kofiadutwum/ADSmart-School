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
