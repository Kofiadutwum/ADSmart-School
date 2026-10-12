import type { Metadata } from "next";
import { ProfileSetup } from "@/components/school-portal/role-pages";

export const metadata: Metadata = { title: "School profile" };

export default function ProfilePage() {
  return <ProfileSetup />;
}
