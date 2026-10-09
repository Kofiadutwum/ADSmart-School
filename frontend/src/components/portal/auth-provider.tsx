"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getJson, postJson } from "@/lib/client-api";
import { publicPath } from "@/lib/hosts";
import type { Me } from "@/lib/types";

type AuthValue = { me: Me; refresh: () => Promise<void>; signOut: () => Promise<void> };
type State = { status: "loading" } | { status: "signed_in"; me: Me } | { status: "signed_out" } | { status: "offline" };

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth() needs <AuthProvider> above it.");
  return value;
}

function stateFor(caught: unknown): State {
  const signedOut = caught instanceof ApiRequestError && caught.body?.code === "not_authenticated";
  return signedOut ? { status: "signed_out" } : { status: "offline" };
}

/**
 * Loads the user signed in at this address and sends everyone else to its sign-in page. The
 * server still decides what each user may see (spec §4.2); this only keeps the screens tidy.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = publicPath(usePathname());
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getJson<Me>("/api/auth/me").then(
      (me) => {
        if (!cancelled) setState({ status: "signed_in", me });
      },
      (caught: unknown) => {
        if (!cancelled) setState(stateFor(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const signedOut = state.status === "signed_out";
  const mustChangePassword = state.status === "signed_in" && state.me.must_change_password && pathname !== "/account";
  useEffect(() => {
    if (signedOut) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    else if (mustChangePassword) router.replace("/account");
  }, [signedOut, mustChangePassword, router, pathname]);

  async function refresh() {
    try {
      setState({ status: "signed_in", me: await getJson<Me>("/api/auth/me") });
    } catch (caught) {
      setState(stateFor(caught));
    }
  }

  async function signOut() {
    await postJson("/api/auth/logout").catch(() => undefined);
    router.replace("/sign-in");
  }

  if (state.status === "signed_in" && !mustChangePassword) {
    return <AuthContext value={{ me: state.me, refresh, signOut }}>{children}</AuthContext>;
  }
  if (state.status === "offline") {
    return (
      <Centered>
        <h1 className="text-2xl font-semibold">We couldn&apos;t reach the school</h1>
        <p className="mt-2 text-ink-muted">Check your connection, then try again.</p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Centered>
    );
  }
  return (
    <Centered>
      <p role="status" className="text-ink-muted">
        Loading…
      </p>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      {children}
    </main>
  );
}
