import type { Metadata } from "next";
import { TestimonialsManager } from "@/components/platform-admin/website/testimonials-manager";

export const metadata: Metadata = { title: "Comments from schools" };

export default function Page() {
  return <TestimonialsManager />;
}
