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

  it("makes the person class teacher, adds a subject and removes teaching, all from their page", async () => {
    const user = userEvent.setup();
    const term = { id: 4, number: 1, name: "Term 1", start_date: "2026-09-08", end_date: "2026-12-18" };
    const basic = { id: 9, name: "Basic 2A", year_group: "basic_2", stream: "A", band: "lower_primary", academic_year: 1, pupils: 30, class_teachers: [], subject_teachers: [] };
    const classes = { year: { id: 1, name: "2026/2027" }, years: [], classes: [basic], year_groups: [], terms: [term], teachers: [] };
    const subjects = [{ id: 2, name: "English", code: "ENG", bands: ["lower_primary"], is_learning_area: false }];
    const classTeacher = { ...KOFI, class_teacher_of: [{ id: 3, class: "Basic 2A", class_id: 9, term: 1, term_id: 4 }] };
    const fetchMock = mockApi([
      ["GET", URL, 200, KOFI],
      ["GET", "/api/school/classes", 200, classes],
      ["GET", "/api/school/subjects", 200, subjects],
      ["PUT", "/api/school/classes/9/class-teacher", 200, basic],
      ["GET", URL, 200, classTeacher],
      ["POST", "/api/school/teaching/bulk", 201, { added: [{}], replaced: [], skipped: [] }],
      ["GET", URL, 200, classTeacher],
      ["DELETE", "/api/school/teaching/1", 204],
      ["GET", URL, 200, { ...classTeacher, teaching: [] }],
    ]);
    render(<StaffDetailView id={4} canEdit />);

    await user.selectOptions(await screen.findByLabelText(/^class teacher of/i), "9");
    await user.selectOptions(screen.getByLabelText(/^term/i, { selector: "#class-teacher-term" }), "4");
    await user.click(screen.getByRole("button", { name: "Make class teacher" }));
    expect(await screen.findByText("Class teacher of Basic 2A (Term 1)")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PUT", "/api/school/classes/9/class-teacher")).toEqual({ term: 4, staff: 4 });

    await user.click(screen.getByRole("checkbox", { name: "English" }));
    await user.click(screen.getByRole("checkbox", { name: "Basic 2A" }));
    await user.selectOptions(screen.getByLabelText(/^term/i, { selector: "#picker-term" }), "4");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Added 1 assignment.");
    expect(bodyOf(fetchMock, "POST", "/api/school/teaching/bulk")).toEqual({
      staff: 4,
      subjects: [2],
      classes: [9],
      term: 4,
    });

    await user.click(screen.getByRole("button", { name: "Remove Mathematics, Basic 2A, Term 1" }));
    expect(await screen.findByText("Removed.")).toBeInTheDocument();
    expect(screen.queryByText("Mathematics, Basic 2A (Term 1)")).not.toBeInTheDocument();
  });

  it("is read-only for the Head Teacher", async () => {
    mockApi([["GET", URL, 200, KOFI]]);
    render(<StaffDetailView id={4} canEdit={false} />);
    expect(await screen.findByLabelText(/^first name/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();
  });
});
