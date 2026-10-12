import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/portal/auth-provider";
import { mockApi } from "@/test/http";
import { SchoolPortalShell, useActiveRole } from "./school-portal-shell";

const ME = {
  id: 7,
  kind: "staff",
  username: "a.admin",
  display_name: "Ama Admin",
  roles: ["Administrator", "Teacher"],
  must_change_password: false,
  school: { name: "Sample School", slug: "sample" },
};

function ShowRole() {
  return <p>Active: {useActiveRole() ?? "none"}</p>;
}

function renderShell(me = ME) {
  mockApi([["GET", "/api/auth/me", 200, me]]);
  render(
    <AuthProvider>
      <SchoolPortalShell name="Sample School">
        <ShowRole />
      </SchoolPortalShell>
    </AuthProvider>,
  );
}

describe("SchoolPortalShell", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/sites/sample.localhost/dashboard");
    window.localStorage.clear();
  });

  it("starts with the first role that has screens and shows its pages", async () => {
    renderShell();
    expect(
      await screen.findByText("Active: Administrator"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Staff" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "My teaching" }),
    ).not.toBeInTheDocument();
  });

  it("switches role, remembers it and opens that role's home", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.selectOptions(
      await screen.findByLabelText("Viewing as"),
      "Teacher",
    );
    expect(screen.getByText("Active: Teacher")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "My teaching" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Staff" }),
    ).not.toBeInTheDocument();
    expect(useRouter().push).toHaveBeenCalledWith("/my-teaching");
    expect(window.localStorage.getItem("school-portal-role")).toBe("Teacher");
  });

  it("shows no switcher for one role, and only Account for roles without screens", async () => {
    renderShell({ ...ME, roles: ["Accountant"] });
    expect(await screen.findByText("Active: none")).toBeInTheDocument();
    expect(screen.queryByLabelText("Viewing as")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
  });
});
