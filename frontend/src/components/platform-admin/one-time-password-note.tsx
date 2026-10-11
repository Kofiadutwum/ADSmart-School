import type { OneTimePassword } from "@/lib/types";

export function OneTimePasswordNote({ password }: { password: OneTimePassword }) {
  return (
    <div role="status" className="mt-3 rounded-control bg-success/10 p-4">
      <p>
        One-time password for <strong>{password.username}</strong>, shown only once:
      </p>
      <p data-testid="one-time-password" className="mt-1 font-mono text-xl tracking-wider">
        {password.one_time_password}
      </p>
      <p className="mt-1 text-sm">They must change it at their next sign-in.</p>
    </div>
  );
}
