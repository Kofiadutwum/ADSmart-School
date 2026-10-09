import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { SecondFactor } from "./second-factor";

const SETUP = { secret: "JBSWY3DPEHPK3PXP", otpauth_url: "otpauth://totp/x", qr_image: "data:image/svg+xml;base64,PHN2Zy8+" };
const EXPIRED = { code: "second_factor_expired", message: "Too many wrong codes. Please sign in again.", fields: {} };

describe("second factor", () => {
  it("sets up an authenticator app and shows the backup codes once", async () => {
    mockApi([
      ["POST", "/api/auth/second-factor/setup", 200, SETUP],
      ["POST", "/api/auth/second-factor/confirm", 200, { status: "signed_in", user: {}, backup_codes: ["abcd-efgh", "jkmn-pqrs"] }],
    ]);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<SecondFactor totp_ready={false} sms_available={false} onDone={onDone} onRestart={vi.fn()} />);

    expect(await screen.findByRole("img", { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Save your backup codes" })).toBeInTheDocument();
    expect(screen.getByText("abcd-efgh")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /saved them/i }));
    expect(onDone).toHaveBeenCalled();
  });

  it("falls back to a code by SMS", async () => {
    const fetchMock = mockApi([
      ["POST", "/api/auth/second-factor/sms", 200, { sent: true }],
      ["POST", "/api/auth/second-factor/verify", 200, { status: "signed_in", user: {} }],
    ]);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<SecondFactor totp_ready sms_available onDone={onDone} onRestart={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /text me a code/i }));
    expect(await screen.findByText(/sent a code to your phone/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/6-digit code/i), "654321");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(bodyOf(fetchMock, "POST", "/api/auth/second-factor/verify")).toEqual({ method: "sms", code: "654321" });
  });

  it("offers a fresh start once the attempt has expired", async () => {
    mockApi([["POST", "/api/auth/second-factor/verify", 429, EXPIRED]]);
    const onRestart = vi.fn();
    const user = userEvent.setup();
    render(<SecondFactor totp_ready sms_available={false} onDone={vi.fn()} onRestart={onRestart} />);

    await user.type(screen.getByLabelText(/6-digit code/i), "000000");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong codes");
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(onRestart).toHaveBeenCalled();
  });
});
