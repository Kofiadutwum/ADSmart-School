import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ClassesData } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { TeachingView } from "./teaching-view";

const TERM = {
  id: 4,
  number: 1,
  name: "Term 1, 2026/2027",
  start_date: "2026-09-08",
  end_date: "2026-12-18",
};
const CLASSES: ClassesData = {
  year: { id: 2, name: "2026/2027" },
  years: [{ id: 2, name: "2026/2027", is_current: true }],
  classes: [
    {
      id: 9,
      name: "Basic 2A",
      year_group: "basic_2",
      stream: "A",
      band: "lower_primary",
      academic_year: 2,
      pupils: 0,
      class_teachers: [],
    },
  ],
  year_groups: [],
  terms: [TERM],
  teachers: [{ id: 5, name: "Abena Owusu" }],
};
const SUBJECTS = [
  {
    id: 1,
    name: "Mathematics",
    code: "MATH",
    bands: ["lower_primary"],
    is_learning_area: false,
  },
  {
    id: 2,
    name: "Social Studies",
    code: "SOC",
    bands: ["jhs"],
    is_learning_area: false,
  },
];
const ROW = {
  id: 30,
  staff_id: 5,
  teacher: "Abena Owusu",
  school_class_id: 9,
  class: "Basic 2A",
  subject_id: 1,
  subject: "Mathematics",
  term_id: 4,
  term: 1,
};

describe("TeachingView", () => {
  it("assigns a teacher, offering only subjects the class studies", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      ["GET", "/api/school/subjects", 200, SUBJECTS],
      ["GET", "/api/school/teaching?term=4", 200, []],
      ["POST", "/api/school/teaching", 201, ROW],
    ]);
    const user = userEvent.setup();
    render(<TeachingView canEdit />);
    const form = await screen.findByRole("form", { name: "Assign teaching" });
    await user.selectOptions(within(form).getByLabelText(/^teacher/i), "Abena Owusu");
    await user.selectOptions(within(form).getByLabelText(/^class/i), "Basic 2A");
    const subject = within(form).getByLabelText(/^subject/i);
    expect(within(subject).queryByRole("option", { name: "Social Studies" })).not.toBeInTheDocument();
    await user.selectOptions(subject, "Mathematics");
    await user.click(within(form).getByRole("button", { name: "Assign" }));
    expect(await screen.findByRole("cell", { name: "Abena Owusu" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/school/teaching")).toEqual({
      staff: 5,
      school_class: 9,
      subject: 1,
      term: 4,
    });
  });

  it("removes an assignment", async () => {
    mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      ["GET", "/api/school/subjects", 200, SUBJECTS],
      ["GET", "/api/school/teaching?term=4", 200, [ROW]],
      ["DELETE", "/api/school/teaching/30", 204],
    ]);
    const user = userEvent.setup();
    render(<TeachingView canEdit />);
    await user.click(
      await screen.findByRole("button", {
        name: "Remove Abena Owusu, Mathematics, Basic 2A",
      }),
    );
    expect(await screen.findByText(/nobody is assigned/i)).toBeInTheDocument();
  });
});
