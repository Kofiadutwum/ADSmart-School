import { SectionTabs } from "@/components/portal/section-tabs";

const TABS = [
  ["/website/articles", "Articles and tips"],
  ["/website/gallery", "Gallery"],
  ["/website/comments", "Comments from schools"],
  ["/website/questions", "Questions"],
  ["/website/tips", "Tips and WhatsApp"],
] as const;

/** The parts of your own website you can edit (business tools spec §5). */
export function WebsiteTabs() {
  return <SectionTabs label="Website" tabs={TABS} />;
}
