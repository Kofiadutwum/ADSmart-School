import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getPlatform } from "@/lib/api";

export const metadata: Metadata = { title: "Sign in" };

export default async function PlatformSignInPage() {
  const { name } = await getPlatform();
  return (
    <AuthFrame name={`${name} admin`}>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-ink-muted">For the {name} team.</p>
      <div className="mt-6">
        <Suspense>
          <SignInForm kinds={["platform"]} />
        </Suspense>
      </div>
    </AuthFrame>
  );
}
