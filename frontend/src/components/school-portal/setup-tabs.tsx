import { SectionTabs } from "@/components/portal/section-tabs";

const TABS = [
  ["/setup/profile", "Profile"],
  ["/setup/years", "Years and terms"],
  ["/setup/calendar", "Calendar"],
  ["/setup/classes", "Classes"],
  ["/setup/subjects", "Subjects"],
  ["/setup/teaching", "Teaching"],
  ["/setup/assessment", "Assessment"],
] as const;

/** School setup (Phase 1 spec §7.2), one tab per part. */
export function SetupTabs() {
  return <SectionTabs label="School setup" tabs={TABS} />;
}
