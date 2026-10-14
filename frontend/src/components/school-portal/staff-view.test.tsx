import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { StaffRow } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { StaffView } from "./staff-view";

const ROW: StaffRow = {
  id: 1,
  name: "Ama Admin",
  username: "a.admin",
  staff_number: "",
  roles: ["Administrator"],
  phone: "+233241234567",
  email: "",
  employment_status: "ACTIVE",
  is_active: true,
  is_demo: false,
  needs_second_factor: true,
  second_factor_ready: true,
  last_sign_in: null,
};
const ESI: StaffRow = {
  ...ROW,
  id: 2,
  name: "Esi Accounts",
  username: "esi",
  roles: ["Accountant"],
  phone: "",
  second_factor_ready: false,
};
const DEMO: StaffRow = { ...ROW, id: 3, name: "Demo Teacher", username: "demo", roles: ["Teacher"], is_demo: true };

describe("StaffView", () => {
  it("lists staff with what needs attention, and filters", async () => {
    const user = userEvent.setup();
    mockApi([["GET", "/api/school/staff", 200, [ROW, ESI, DEMO]]]);
    render(<StaffView canEdit />);
    const esi = (await screen.findByRole("link", { name: "Esi Accounts" })).closest("li") as HTMLElement;
    expect(within(esi).getByText("Can't get sign-in codes")).toBeInTheDocument();
    const demo = screen.getByRole("link", { name: "Demo Teacher" }).closest("li") as HTMLElement;
    expect(within(demo).getByText("Demo")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Show"), "Can't get sign-in codes");
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("link").map((link) => link.textContent)).toEqual(["Esi Accounts"]);
  });

  it("adds a member of staff and shows the one-time password once", async () => {
    const user = userEvent.setup();
    const added = { ...ESI, id: 9, name: "Kofi Teacher", username: "kofi" };
    const fetchMock = mockApi([
      ["GET", "/api/school/staff", 200, [ROW]],
      ["POST", "/api/school/staff", 201, { staff: added, one_time_password: "abcd-efgh-jkmn" }],
    ]);
    render(<StaffView canEdit />);
    await user.click(await screen.findByRole("button", { name: "Add a member of staff" }));
    const form = screen.getByRole("form", { name: "Add a member of staff" });
    await user.type(within(form).getByLabelText(/^first name/i), "Kofi");
    await user.type(within(form).getByLabelText(/^surname/i), "Teacher");
    await user.type(within(form).getByLabelText(/^username/i), "kofi");
    await user.click(within(form).getByRole("checkbox", { name: "Teacher" }));
    await user.click(within(form).getByRole("button", { name: "Add" }));
    expect(await screen.findByTestId("one-time-password")).toHaveTextContent("abcd-efgh-jkmn");
    expect(screen.getByRole("link", { name: "Kofi Teacher" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/school/staff")).toMatchObject({
      first_name: "Kofi",
      surname: "Teacher",
      username: "kofi",
      roles: ["Teacher"],
    });
  });

  it("asks for a role before sending", async () => {
    const user = userEvent.setup();
    mockApi([["GET", "/api/school/staff", 200, []]]);
    render(<StaffView canEdit />);
    await user.click(await screen.findByRole("button", { name: "Add a member of staff" }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Choose at least one role.")).toBeInTheDocument();
  });

  it("offers no adding to the Head Teacher", async () => {
    mockApi([["GET", "/api/school/staff", 200, [ROW]]]);
    render(<StaffView canEdit={false} />);
    expect(await screen.findByRole("link", { name: "Ama Admin" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a member of staff" })).not.toBeInTheDocument();
  });
});
