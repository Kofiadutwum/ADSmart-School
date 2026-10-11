import type { ReactNode } from "react";
import { WebsiteTabs } from "@/components/platform-admin/website/website-tabs";

export default function WebsiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WebsiteTabs />
      {children}
    </>
  );
}
