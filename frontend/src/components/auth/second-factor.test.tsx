import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { SecondFactor } from "./second-factor";

const EXPIRED = { code: "second_factor_expired", message: "Too many wrong codes. Please sign in again.", fields: {} };
const EMAIL = "k•••@example.com";
const PHONE = "024 ••• 4567";

describe("second factor", () => {
  it("offers only the ways the account can be reached", () => {
    mockApi([]);
    render(<SecondFactor email={EMAIL} phone={null} onDone={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByRole("button", { name: `Email the code to ${EMAIL}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /text the code/i })).not.toBeInTheDocument();
  });

  it("emails a code and signs in with it", async () => {
    const fetchMock = mockApi([
      ["POST", "/api/auth/second-factor/email", 200, { sent: true }],
      ["POST", "/api/auth/second-factor/verify", 200, { status: "signed_in", user: {} }],
    ]);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<SecondFactor email={EMAIL} phone={PHONE} onDone={onDone} onRestart={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /email the code/i }));
    expect(await screen.findByText(`We've sent a 6-digit code to ${EMAIL}. It expires in 10 minutes.`)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/6-digit code/i), "654321");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(bodyOf(fetchMock, "POST", "/api/auth/second-factor/verify")).toEqual({ code: "654321" });
  });

  it("can switch to a text message", async () => {
    mockApi([
      ["POST", "/api/auth/second-factor/email", 200, { sent: true }],
      ["POST", "/api/auth/second-factor/sms", 200, { sent: true }],
    ]);
    const user = userEvent.setup();
    render(<SecondFactor email={EMAIL} phone={PHONE} onDone={vi.fn()} onRestart={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /email the code/i }));
    await user.click(await screen.findByRole("button", { name: `Text the code to ${PHONE} instead` }));
    expect(await screen.findByText(`We've sent a 6-digit code to ${PHONE}. It expires in 10 minutes.`)).toBeInTheDocument();
  });

  it("says when there is nowhere to send a code", () => {
    mockApi([]);
    render(<SecondFactor email={null} phone={null} onDone={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no email address or mobile number/i);
  });

  it("offers a fresh start once the attempt has expired", async () => {
    mockApi([
      ["POST", "/api/auth/second-factor/sms", 200, { sent: true }],
      ["POST", "/api/auth/second-factor/verify", 429, EXPIRED],
    ]);
    const onRestart = vi.fn();
    const user = userEvent.setup();
    render(<SecondFactor email={null} phone={PHONE} onDone={vi.fn()} onRestart={onRestart} />);
    await user.click(screen.getByRole("button", { name: /text the code/i }));
    await user.type(await screen.findByLabelText(/6-digit code/i), "000000");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong codes");
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(onRestart).toHaveBeenCalled();
  });
});
