import type { Metadata } from "next";
import { FaqsManager } from "@/components/platform-admin/website/faqs-manager";

export const metadata: Metadata = { title: "Questions" };

export default function Page() {
  return <FaqsManager />;
}
