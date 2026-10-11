import type { Metadata } from "next";
import { TipsSettings } from "@/components/platform-admin/website/tips-settings";

export const metadata: Metadata = { title: "Tips and WhatsApp" };

export default function Page() {
  return <TipsSettings />;
}
