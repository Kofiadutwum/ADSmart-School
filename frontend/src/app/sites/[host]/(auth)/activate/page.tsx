import type { Metadata } from "next";
import { ActivateForm } from "@/components/auth/activate-form";

export const metadata: Metadata = { title: "Set your password" };

export default function ActivatePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">First time, or forgot your password?</h1>
      <div className="mt-4">
        <ActivateForm home="/home" />
      </div>
    </>
  );
}
