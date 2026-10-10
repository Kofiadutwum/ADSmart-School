import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter, useSearchParams } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { SignInForm } from "./sign-in-form";

const SCHOOL = ["parent", "student", "staff"] as const;
const INVALID = { code: "invalid_credentials", message: "Incorrect username or password.", fields: {} };

describe("sign-in form", () => {
  it("asks parents for their mobile number and offers to keep them signed in", () => {
    mockApi([]);
    render(<SignInForm kinds={SCHOOL} />);
    expect(screen.getByRole("tab", { name: "Parent" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/mobile number/i)).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText(/keep me signed in/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /first time/i })).toHaveAttribute("href", "/activate");
  });

  it("moves between tabs with the arrow keys", async () => {
    mockApi([]);
    const user = userEvent.setup();
    render(<SignInForm kinds={SCHOOL} />);
    await user.click(screen.getByRole("tab", { name: "Parent" }));
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Staff" })).toHaveFocus();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/keep me signed in/i)).not.toBeInTheDocument();
  });

  it("signs in and goes on to the page that was asked for", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("next=/account/security") as unknown as ReturnType<typeof useSearchParams>,
    );
    const fetchMock = mockApi([["POST", "/api/auth/login", 200, { status: "signed_in", user: {} }]]);
    const user = userEvent.setup();
    render(<SignInForm kinds={SCHOOL} />);
    await user.type(screen.getByLabelText(/mobile number/i), "024 123 4567");
    await user.type(screen.getByLabelText(/^password/i), "correct horse battery");
    await user.click(screen.getByLabelText(/keep me signed in/i));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/account/security"));
    expect(bodyOf(fetchMock, "POST", "/api/auth/login")).toEqual({
      kind: "parent",
      identifier: "024 123 4567",
      password: "correct horse battery",
      remember: true,
    });
  });

  it("shows platform staff a username field without tabs", async () => {
    const fetchMock = mockApi([["POST", "/api/auth/login", 400, INVALID]]);
    const user = userEvent.setup();
    render(<SignInForm kinds={["platform"]} />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText(/ask another member of the platform team/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/username/i), "ops");
    await user.type(screen.getByLabelText(/^password/i), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password.");
    expect(bodyOf(fetchMock, "POST", "/api/auth/login")).toMatchObject({ kind: "platform", remember: false });
  });

  it("skips the form when already signed in", async () => {
    mockApi([["GET", "/api/auth/me", 200, { id: 1 }]]);
    render(<SignInForm kinds={SCHOOL} />);
    await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith("/account"));
  });

  it("shows the server's message and moves focus to it", async () => {
    mockApi([["POST", "/api/auth/login", 400, INVALID]]);
    const user = userEvent.setup();
    render(<SignInForm kinds={SCHOOL} />);
    await user.type(screen.getByLabelText(/mobile number/i), "024 123 4567");
    await user.type(screen.getByLabelText(/^password/i), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect username or password.");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("needs both fields before calling the server", async () => {
    const fetchMock = mockApi([]);
    const user = userEvent.setup();
    render(<SignInForm kinds={SCHOOL} />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your mobile number and password.");
    expect(bodyOf(fetchMock, "POST", "/api/auth/login")).toBeUndefined();
  });

  it("asks for the second step when the role needs one", async () => {
    mockApi([["POST", "/api/auth/login", 200, { status: "second_factor", email: "a•••@example.com", phone: "024 ••• 4567" }]]);
    const user = userEvent.setup();
    render(<SignInForm kinds={SCHOOL} />);
    await user.click(screen.getByRole("tab", { name: "Staff" }));
    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/^password/i), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Confirm it's you" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Text the code to 024 ••• 4567" })).toBeInTheDocument();
  });
});
