import type { Metadata } from "next";
import { GalleryManager } from "@/components/platform-admin/website/gallery-manager";

export const metadata: Metadata = { title: "Gallery" };

export default function Page() {
  return <GalleryManager />;
}
