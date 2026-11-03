import type { Metadata } from "next";
import { SignInsView } from "@/components/school-portal/sign-ins-view";

export const metadata: Metadata = { title: "Sign-in lists" };

export default function Page() {
  return <SignInsView />;
}
