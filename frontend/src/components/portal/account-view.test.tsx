import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { AccountView } from "./account-view";
import { AuthProvider } from "./auth-provider";

const ME = {
  id: 1, kind: "parent", username: "+233241234567", display_name: "Ama Mensah", roles: ["Parent"],
  must_change_password: false, has_authenticator: false, school: { name: "AD Smart School", slug: "adsmart" },
};
const SESSIONS = [
  { id: 1, device: "Chrome on Windows", ip_address: "41.66.1.2", signed_in_at: "2026-10-09T08:00:00Z", last_seen: "2026-10-09T14:05:00Z", current: true },
  { id: 7, device: "Chrome on Android", ip_address: null, signed_in_at: "2026-10-01T08:00:00Z", last_seen: "2026-10-08T19:30:00Z", current: false },
];

function renderAccount(me: object = ME, extra: Parameters<typeof mockApi>[0] = []) {
  vi.mocked(usePathname).mockReturnValue("/account");
  const fetchMock = mockApi([["GET", "/api/auth/me", 200, me], ["GET", "/api/auth/sessions", 200, SESSIONS], ...extra]);
  render(
    <AuthProvider>
      <AccountView />
    </AuthProvider>,
  );
  return fetchMock;
}

describe("Account page", () => {
  it("shows the profile with the phone number written the local way", async () => {
    renderAccount();
    expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
    expect(screen.getByText("024 123 4567")).toBeInTheDocument();
    expect(screen.getByText("Parent")).toBeInTheDocument();
  });

  it("lists signed-in devices and signs out another one", async () => {
    const fetchMock = renderAccount(ME, [["DELETE", "/api/auth/sessions/7", 204]]);
    const user = userEvent.setup();
    expect(await screen.findByText("This device")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out Chrome on Android" }));
    await waitFor(() => expect(screen.queryByText("Chrome on Android")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sessions/7", expect.objectContaining({ method: "DELETE" }));
  });

  it("asks a new pupil to choose a password", async () => {
    renderAccount({ ...ME, kind: "student", username: "2601473", roles: ["Student"], must_change_password: true });
    expect(await screen.findByText(/choose your own password/i)).toBeInTheDocument();
    expect(screen.getByText("26-0147-3")).toBeInTheDocument();
  });

  it("checks the new password was typed the same twice", async () => {
    const fetchMock = renderAccount();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Change password" });
    await user.type(screen.getByLabelText(/current password/i), "old passphrase here");
    await user.type(screen.getByLabelText(/^new password/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/type it again/i), "something else entirely");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("The two passwords don't match.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/auth/password")).toBeUndefined();
  });

  it("changes the password and says so", async () => {
    const fetchMock = renderAccount(ME, [["POST", "/api/auth/password", 200, ME], ["GET", "/api/auth/me", 200, ME]]);
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Change password" });
    await user.type(screen.getByLabelText(/current password/i), "old passphrase here");
    await user.type(screen.getByLabelText(/^new password/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/type it again/i), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/auth/password")).toEqual({
      current_password: "old passphrase here",
      new_password: "a brand new passphrase",
    });
  });
});
