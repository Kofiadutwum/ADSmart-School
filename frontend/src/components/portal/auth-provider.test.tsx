import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useRouter } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { AuthProvider } from "./auth-provider";

const ME = {
  id: 1, kind: "parent", username: "+233241234567", display_name: "Ama Mensah", roles: ["Parent"],
  must_change_password: false, has_authenticator: false, school: { name: "AD Smart School", slug: "adsmart" },
};
const SIGNED_OUT = { code: "not_authenticated", message: "Please sign in.", fields: {} };

describe("AuthProvider", () => {
  it("shows the page to signed-in users", async () => {
    mockApi([["GET", "/api/auth/me", 200, ME]]);
    render(<AuthProvider><p>private</p></AuthProvider>);
    expect(await screen.findByText("private")).toBeInTheDocument();
  });

  it("sends signed-out visitors to sign in at the same address, remembering where they were going", async () => {
    vi.mocked(usePathname).mockReturnValue("/sites/adsmart.localhost/account");
    mockApi([["GET", "/api/auth/me", 403, SIGNED_OUT]]);
    render(<AuthProvider><p>private</p></AuthProvider>);
    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/sign-in?next=%2Faccount"));
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("keeps users who must change their password on the Account page", async () => {
    vi.mocked(usePathname).mockReturnValue("/somewhere-else");
    mockApi([["GET", "/api/auth/me", 200, { ...ME, must_change_password: true }]]);
    render(<AuthProvider><p>private</p></AuthProvider>);
    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/account"));
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("asks for the privacy notice to be read and accepted before showing the portal", async () => {
    const notice = { id: 7, title: "Privacy notice", version: "2", body: "We keep your details safe." };
    const fetchMock = mockApi([
      ["GET", "/api/auth/me", 200, { ...ME, privacy_notice: notice }],
      ["POST", "/api/auth/privacy", 200, { ...ME, privacy_notice: null }],
    ]);
    const user = userEvent.setup();
    render(<AuthProvider><p>private</p></AuthProvider>);

    expect(await screen.findByText("We keep your details safe.")).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
    const accept = screen.getByRole("button", { name: "Accept and continue" });
    expect(accept).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /i have read and accept/i }));
    await user.click(accept);

    expect(await screen.findByText("private")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/auth/privacy")).toEqual({ notice: 7 });
  });

  it("offers a retry when the school can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<AuthProvider><p>private</p></AuthProvider>);
    expect(await screen.findByRole("heading", { name: /couldn't reach the school/i })).toBeInTheDocument();
  });
});
