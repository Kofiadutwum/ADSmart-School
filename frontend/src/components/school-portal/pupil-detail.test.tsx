import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { EmergencyContactRow, PupilDetail } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { PupilDetailView } from "./pupil-detail";

const AMA: PupilDetail = {
  id: 4,
  student_id: "2600017",
  name: "Ama Mensah",
  class: "Basic 5A",
  class_id: 9,
  band: "upper_primary",
  status: "ACTIVE",
  is_demo: true,
  contacts_incomplete: true,
  initials: "AM",
  has_photo: false,
  first_name: "Ama",
  middle_name: "",
  surname: "Mensah",
  date_of_birth: "2015-03-14",
  gender: "F",
  previous_school: "",
  address: "",
  pickup_point: "",
  admission_date: "2026-09-08",
  photo_on_file: false,
  login: null,
  can_have_login: true,
};
const URL = "/api/school/pupils/4";
const AUNT: EmergencyContactRow = {
  id: 1,
  name: "Aunt Esi",
  phone: "+233241112222",
  relationship: "Aunt",
  priority: 1,
};
const PLACE = { id: 1, class: "Basic 5A", year: "2026/2027", start_date: "2026-09-08", end_date: null, outcome: "" };

function load(extra: [string, string, number, unknown?][] = []) {
  return mockApi([["GET", URL, 200, AMA], ["GET", `${URL}/contacts`, 200, [AUNT]], ...extra]);
}

describe("PupilDetailView", () => {
  it("shows the pupil with what needs attention", async () => {
    load();
    render(<PupilDetailView id={4} canEdit />);
    expect(await screen.findByRole("heading", { level: 1, name: "Ama Mensah" })).toBeInTheDocument();
    expect(screen.getByText("Student ID 2600017 · Basic 5A")).toBeInTheDocument();
    expect(await screen.findByText(/add at least two emergency contacts/i)).toBeInTheDocument();
  });

  it("saves the profile", async () => {
    const user = userEvent.setup();
    const saved = { ...AMA, middle_name: "Serwaa", name: "Ama Serwaa Mensah" };
    const fetchMock = load([["PATCH", URL, 200, saved]]);
    render(<PupilDetailView id={4} canEdit />);
    await user.type(await screen.findByLabelText(/^middle name/i), "Serwaa");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Ama Serwaa Mensah" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PATCH", URL)).toMatchObject({ middle_name: "Serwaa" });
  });

  it("changes the status with a reason", async () => {
    const user = userEvent.setup();
    const fetchMock = load([["POST", `${URL}/status`, 200, { ...AMA, status: "SUSPENDED" }]]);
    render(<PupilDetailView id={4} canEdit />);
    const status = await screen.findByRole("form", { name: "Change status" });
    await user.selectOptions(within(status).getByLabelText(/^new status/i), "Suspended");
    await user.click(within(status).getByRole("button", { name: "Change status" }));
    expect(await within(status).findByText("Give a reason.")).toBeInTheDocument();
    await user.type(within(status).getByLabelText(/^reason/i), "One week, fighting");
    await user.click(within(status).getByRole("button", { name: "Change status" }));
    expect(await screen.findByText("Status: Suspended")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", `${URL}/status`)).toEqual({
      status: "SUSPENDED",
      reason: "One week, fighting",
    });
  });

  it("adds and removes emergency contacts", async () => {
    const user = userEvent.setup();
    const uncle = { id: 2, name: "Uncle Yaw", phone: "+233322020000", relationship: "Uncle", priority: 2 };
    const fetchMock = load([
      ["POST", `${URL}/contacts`, 201, uncle],
      ["DELETE", "/api/school/contacts/1", 204],
    ]);
    render(<PupilDetailView id={4} canEdit />);
    const add = await screen.findByRole("form", { name: "Add an emergency contact" });
    await user.type(within(add).getByLabelText(/^name/i), "Uncle Yaw");
    await user.type(within(add).getByLabelText(/^phone/i), "032 202 0000");
    await user.type(within(add).getByLabelText(/^relationship/i), "Uncle");
    await user.click(within(add).getByRole("button", { name: "Add contact" }));
    expect(await screen.findByText("Uncle Yaw")).toBeInTheDocument();
    expect(screen.queryByText(/add at least two emergency contacts/i)).not.toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", `${URL}/contacts`)).toEqual({
      name: "Uncle Yaw",
      phone: "032 202 0000",
      relationship: "Uncle",
    });
    await user.click(screen.getByRole("button", { name: "Remove Aunt Esi" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByText(/add at least two emergency contacts/i)).toBeInTheDocument();
  });

  it("gives a Basic 4+ pupil a sign-in and turns a demo record real", async () => {
    const user = userEvent.setup();
    load([
      ["POST", `${URL}/login`, 200, { username: "2600017", one_time_password: "abcd-efgh-jkmn" }],
      ["POST", `${URL}/make-real`, 200, { ...AMA, is_demo: false }],
    ]);
    render(<PupilDetailView id={4} canEdit />);
    await user.click(await screen.findByRole("button", { name: "Give a sign-in" }));
    expect(await screen.findByTestId("one-time-password")).toHaveTextContent("abcd-efgh-jkmn");
    await user.click(screen.getByRole("button", { name: "This is now a real record" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Ama Mensah" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This is now a real record" })).not.toBeInTheDocument();
  });

  it("is read-only for the Head Teacher", async () => {
    load();
    render(<PupilDetailView id={4} canEdit={false} />);
    expect(await screen.findByLabelText(/^first name/i)).toBeDisabled();
    expect(screen.queryByRole("form", { name: "Add an emergency contact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Give a sign-in" })).not.toBeInTheDocument();
  });

  it("moves between the record's tabs", async () => {
    const user = userEvent.setup();
    load([["GET", `${URL}/enrolments`, 200, [PLACE]]]);
    render(<PupilDetailView id={4} canEdit />);
    await user.click(await screen.findByRole("tab", { name: "Class history" }));
    expect(screen.getByRole("tab", { name: "Class history" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText(/Basic 5A, 2026\/2027/)).toBeInTheDocument();
  });
});
