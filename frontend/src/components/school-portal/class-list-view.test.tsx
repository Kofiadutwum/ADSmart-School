import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ClassPupils, TeacherPupilView } from "@/lib/types";
import { mockApi } from "@/test/http";
import { ClassListView, ClassPupilView } from "./class-list-view";

const LIST: ClassPupils = {
  class: { id: 9, name: "Basic 5A", is_class_teacher: true },
  pupils: [
    {
      id: 4,
      student_id: "2600017",
      name: "Ama Mensah",
      class: "Basic 5A",
      class_id: 9,
      band: "upper_primary",
      status: "ACTIVE",
      is_demo: false,
      contacts_incomplete: false,
      initials: "AM",
      has_photo: false,
    },
  ],
};
const MOTHER = {
  name: "Akosua Mensah",
  relationship: "Mother",
  phone: "+233245550001",
  alt_phone: "",
  is_primary_contact: true,
};
const AMA: TeacherPupilView = {
  id: 4,
  student_id: "2600017",
  name: "Ama Mensah",
  first_name: "Ama",
  surname: "Mensah",
  gender: "F",
  date_of_birth: "2015-03-14",
  class: "Basic 5A",
  class_id: 9,
  status: "ACTIVE",
  initials: "AM",
  has_photo: false,
  login: null,
  can_have_login: true,
  can_issue_login: true,
  parents: [MOTHER],
  emergency_contacts: [{ name: "Aunt Esi", phone: "+233241112222", relationship: "Aunt" }],
};
const SIGN_IN = { username: "2600017", one_time_password: "abcd-efgh-jkmn" };

describe("ClassListView", () => {
  it("lists the class's pupils, linking to each", async () => {
    mockApi([["GET", "/api/school/classes/9/pupils", 200, LIST]]);
    render(<ClassListView classId={9} />);
    expect(await screen.findByRole("heading", { name: "Basic 5A" })).toBeInTheDocument();
    expect(screen.getByText("You are the class teacher.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ama Mensah" })).toHaveAttribute("href", "/my-teaching/9/4");
  });
});

describe("ClassPupilView", () => {
  it("shows the class teacher parent and emergency contacts, and issues a sign-in", async () => {
    const user = userEvent.setup();
    mockApi([
      ["GET", "/api/school/classes/9/pupils/4", 200, AMA],
      ["POST", "/api/school/pupils/4/login", 200, SIGN_IN],
    ]);
    render(<ClassPupilView classId={9} pupilId={4} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Ama Mensah" })).toBeInTheDocument();
    expect(screen.getByText(/Akosua Mensah/)).toHaveTextContent("Mother");
    expect(screen.getByText(/Aunt Esi/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Give a sign-in" }));
    expect(await screen.findByTestId("one-time-password")).toHaveTextContent("abcd-efgh-jkmn");
  });

  it("shows a subject teacher no contacts and no sign-in button", async () => {
    const subjectView: TeacherPupilView = { ...AMA, can_issue_login: false };
    delete subjectView.parents;
    delete subjectView.emergency_contacts;
    mockApi([["GET", "/api/school/classes/9/pupils/4", 200, subjectView]]);
    render(<ClassPupilView classId={9} pupilId={4} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Ama Mensah" })).toBeInTheDocument();
    expect(screen.queryByText(/Akosua Mensah/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Give a sign-in" })).not.toBeInTheDocument();
  });
});
