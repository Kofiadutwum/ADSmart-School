import type { ReactNode } from "react";
import { SetupTabs } from "@/components/school-portal/setup-tabs";

export default function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="mb-4 text-3xl font-semibold">School setup</h1>
      <SetupTabs />
      {children}
    </>
  );
}
