import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getSite } from "@/lib/api";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ params }: { params: Promise<{ host: string }> }) {
  const { school } = await getSite((await params).host);
  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-ink-muted">For parents, pupils and staff of {school.name}.</p>
      <div className="mt-6">
        <Suspense>
          <SignInForm kinds={["parent", "student", "staff"]} />
        </Suspense>
      </div>
    </>
  );
}
