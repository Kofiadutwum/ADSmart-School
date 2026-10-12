import type { Metadata } from "next";
import { MyTeachingView } from "@/components/school-portal/my-teaching-view";

export const metadata: Metadata = { title: "My teaching" };

export default function MyTeachingPage() {
  return <MyTeachingView />;
}
