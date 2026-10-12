import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { StaffDetail } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { StaffDetailView } from "./staff-detail";

const KOFI: StaffDetail = {
  id: 4,
  name: "Kofi Mensah",
  first_name: "Kofi",
  surname: "Mensah",
  username: "k.mensah",
  staff_number: "",
  roles: ["Teacher"],
  phone: "+233241234567",
  email: "",
  qualifications: "",
  licence_number: "",
  emergency_contact: "",
  employment_status: "ACTIVE",
  is_active: true,
  is_demo: true,
  needs_second_factor: false,
  second_factor_ready: true,
  last_sign_in: null,
  teaching: [{ id: 1, class: "Basic 2A", class_id: 9, subject: "Mathematics", term: 1, term_id: 4 }],
  class_teacher_of: [],
};
const URL = "/api/school/staff/4";

describe("StaffDetailView", () => {
  it("shows the profile and the person's teaching", async () => {
    mockApi([["GET", URL, 200, KOFI]]);
    render(<StaffDetailView id={4} canEdit />);
    expect(await screen.findByRole("heading", { name: "Kofi Mensah" })).toBeInTheDocument();
    expect(screen.getByText("Mathematics, Basic 2A (Term 1)")).toBeInTheDocument();
  });

  it("saves the profile and roles", async () => {
    const user = userEvent.setup();
    const saved = { ...KOFI, licence_number: "NTC-1", roles: ["Front Desk Officer", "Teacher"] };
    const fetchMock = mockApi([
      ["GET", URL, 200, KOFI],
      ["PATCH", URL, 200, saved],
    ]);
    render(<StaffDetailView id={4} canEdit />);
    await user.type(await screen.findByLabelText(/^teaching licence/i), "NTC-1");
    await user.click(screen.getByRole("checkbox", { name: "Front Desk Officer" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PATCH", URL)).toMatchObject({
      licence_number: "NTC-1",
      roles: ["Front Desk Officer", "Teacher"],
    });
  });

  it("resets the password and shows it once", async () => {
    const user = userEvent.setup();
    mockApi([
      ["GET", URL, 200, KOFI],
      ["POST", `${URL}/reset-password`, 200, { username: "k.mensah", one_time_password: "wxyz-2345-6789" }],
    ]);
    render(<StaffDetailView id={4} canEdit />);
    await user.click(await screen.findByRole("button", { name: "Reset password" }));
    expect(await screen.findByTestId("one-time-password")).toHaveTextContent("wxyz-2345-6789");
  });

  it("explains why the last Administrator can't be switched off", async () => {
    const user = userEvent.setup();
    const refused = {
      code: "last_administrator",
      message: "The school must keep at least one active Administrator.",
      fields: {},
    };
    mockApi([
      ["GET", URL, 200, KOFI],
      ["PATCH", URL, 400, refused],
    ]);
    render(<StaffDetailView id={4} canEdit />);
    await user.click(await screen.findByRole("button", { name: "Switch off sign-in" }));
    expect(await screen.findByText(/at least one active Administrator/)).toBeInTheDocument();
  });

  it("turns a demo record into a real one", async () => {
    const user = userEvent.setup();
    mockApi([
      ["GET", URL, 200, KOFI],
      ["POST", `${URL}/make-real`, 200, { ...KOFI, is_demo: false }],
    ]);
    render(<StaffDetailView id={4} canEdit />);
    await user.click(await screen.findByRole("button", { name: "This is now a real record" }));
    expect(await screen.findByRole("heading", { name: "Kofi Mensah" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This is now a real record" })).not.toBeInTheDocument();
  });

  it("is read-only for the Head Teacher", async () => {
    mockApi([["GET", URL, 200, KOFI]]);
    render(<StaffDetailView id={4} canEdit={false} />);
    expect(await screen.findByLabelText(/^first name/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();
  });
});
