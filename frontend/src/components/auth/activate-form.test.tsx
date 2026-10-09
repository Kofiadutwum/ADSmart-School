import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { ActivateForm } from "./activate-form";

const SENT = { message: "If this number is registered, a code has been sent." };

describe("parent activation", () => {
  it("requests a code, then sets the password and signs in", async () => {
    const fetchMock = mockApi([
      ["POST", "/api/auth/parent/request-code", 200, SENT],
      ["POST", "/api/auth/parent/set-password", 200, { status: "signed_in", user: {} }],
    ]);
    const user = userEvent.setup();
    render(<ActivateForm />);
    await user.type(screen.getByLabelText(/mobile number/i), "024 123 4567");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(SENT.message)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/code from the sms/i), "123456");
    await user.type(screen.getByLabelText(/^new password/i), "our family passphrase");
    await user.type(screen.getByLabelText(/type it again/i), "our family passphrase");
    await user.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/account"));
    expect(bodyOf(fetchMock, "POST", "/api/auth/parent/set-password")).toEqual({
      phone: "024 123 4567",
      code: "123456",
      password: "our family passphrase",
      remember: false,
    });
  });

  it("checks the number before sending anything", async () => {
    const fetchMock = mockApi([]);
    const user = userEvent.setup();
    render(<ActivateForm />);
    await user.type(screen.getByLabelText(/mobile number/i), "12345");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Enter a Ghana mobile number, e.g. 024 123 4567.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/auth/parent/request-code")).toBeUndefined();
  });

  it("shows the server's field errors under the fields", async () => {
    mockApi([
      ["POST", "/api/auth/parent/request-code", 200, SENT],
      [
        "POST",
        "/api/auth/parent/set-password",
        400,
        { code: "validation_error", message: "Please check the highlighted fields.", fields: { password: ["This password is too common."] } },
      ],
    ]);
    const user = userEvent.setup();
    render(<ActivateForm />);
    await user.type(screen.getByLabelText(/mobile number/i), "0241234567");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await user.type(await screen.findByLabelText(/code from the sms/i), "123456");
    await user.type(screen.getByLabelText(/^new password/i), "password1234");
    await user.type(screen.getByLabelText(/type it again/i), "password1234");
    await user.click(screen.getByRole("button", { name: /set password/i }));
    expect(await screen.findByText("This password is too common.")).toBeInTheDocument();
  });
});
