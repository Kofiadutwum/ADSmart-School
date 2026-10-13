import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { todayInAccra } from "@/lib/dates";
import type { ClassesData, EnrolmentOverview, PupilRow } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { EnrolmentView, OverviewView } from "./enrolment-view";

const BASIC_2A = {
  id: 9,
  name: "Basic 2A",
  year_group: "basic_2",
  stream: "A",
  band: "lower_primary",
  academic_year: 2,
  pupils: 0,
  class_teachers: [],
};
const CLASSES: ClassesData = {
  year: { id: 2, name: "2026/2027" },
  years: [{ id: 2, name: "2026/2027", is_current: true }],
  classes: [BASIC_2A],
  year_groups: [],
  terms: [],
  teachers: [],
};
const AMA: PupilRow = {
  id: 1,
  student_id: "2600017",
  name: "Ama Mensah",
  class: "",
  class_id: null,
  band: "",
  status: "ACTIVE",
  is_demo: false,
  contacts_incomplete: false,
  initials: "AM",
  has_photo: false,
};
const YAW: PupilRow = { ...AMA, id: 2, name: "Yaw Boateng" };
const NOT_PLACED = "/api/school/pupils?class=none";

describe("EnrolmentView", () => {
  it("places the ticked pupils in a class", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      ["GET", NOT_PLACED, 200, [AMA, YAW]],
      ["POST", "/api/school/enrolments", 200, { placed: 1, already: 0 }],
      ["GET", NOT_PLACED, 200, [YAW]],
    ]);
    render(<EnrolmentView />);
    await user.click(await screen.findByRole("checkbox", { name: "Ama Mensah" }));
    await user.selectOptions(screen.getByLabelText(/^place in/i), "Basic 2A");
    await user.click(screen.getByRole("button", { name: "Place 1 pupil" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Placed 1 pupil.");
    expect(bodyOf(fetchMock, "POST", "/api/school/enrolments")).toEqual({
      students: [1],
      school_class: 9,
      start_date: todayInAccra(),
    });
    expect(await screen.findByRole("checkbox", { name: "Yaw Boateng" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Ama Mensah" })).not.toBeInTheDocument();
  });

  it("asks for a class before placing", async () => {
    const user = userEvent.setup();
    mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      ["GET", NOT_PLACED, 200, [AMA]],
    ]);
    render(<EnrolmentView />);
    await user.click(await screen.findByRole("checkbox", { name: "Ama Mensah" }));
    await user.click(screen.getByRole("button", { name: "Place 1 pupil" }));
    expect(await screen.findByText("Choose a class.")).toBeInTheDocument();
  });
});

describe("OverviewView", () => {
  it("shows enrolment by level and class", async () => {
    const overview: EnrolmentOverview = {
      year: "2026/2027",
      levels: [
        {
          band: "lower_primary",
          label: "Basic 1–3",
          count: 3,
          classes: [
            { id: 9, name: "Basic 2A", count: 2 },
            { id: 10, name: "Basic 2B", count: 1 },
          ],
        },
      ],
      total: 4,
      not_in_class: 1,
    };
    mockApi([["GET", "/api/school/enrolment-overview", 200, overview]]);
    render(<OverviewView />);
    const level = await screen.findByRole("region", { name: "Basic 1–3" });
    expect(within(level).getByText("3 pupils")).toBeInTheDocument();
    expect(within(level).getByRole("row", { name: "Basic 2A 2" })).toBeInTheDocument();
    expect(screen.getByText(/4 pupils in all/)).toHaveTextContent("1 not yet in a class");
  });
});
