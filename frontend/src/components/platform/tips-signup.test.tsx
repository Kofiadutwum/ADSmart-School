import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { TipsSignup } from "./tips-signup";

const TOKEN = ["GET", "/api/public/enquiries/form-token", 200, { token: "signed" }] as const;

describe("TipsSignup", () => {
  it("asks for consent before signing up", async () => {
    const fetchMock = mockApi([[...TOKEN]]);
    const user = userEvent.setup();
    render(<TipsSignup platformName="ADsmartschool" />);
    await user.type(screen.getByLabelText(/^email/i), "ama@example.com");
    await user.click(screen.getByRole("button", { name: "Send me tips" }));
    expect(await screen.findByText(/tick the box/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signs up and asks the person to confirm by email", async () => {
    const fetchMock = mockApi([[...TOKEN], ["POST", "/api/public/platform/tips", 202, { status: "check_email" }]]);
    const user = userEvent.setup();
    render(<TipsSignup platformName="ADsmartschool" />);
    await user.type(screen.getByLabelText(/^email/i), "ama@example.com");
    await user.click(screen.getByRole("checkbox", { name: /send me new tips/i }));
    await user.click(screen.getByRole("button", { name: "Send me tips" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/public/platform/tips")).toEqual({
      email: "ama@example.com", consent: true, form_token: "signed", website: "",
    });
  });
});
