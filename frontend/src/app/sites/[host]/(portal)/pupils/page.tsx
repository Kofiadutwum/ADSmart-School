import type { Metadata } from "next";
import { PupilsPage } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "Pupils" };

export default function Page() {
  return <PupilsPage />;
}
