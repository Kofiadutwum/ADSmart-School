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
      subject_teachers: [],
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
  it("assigns a teacher to ticked subjects and classes, then shows the new teaching", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      ["GET", "/api/school/subjects", 200, SUBJECTS],
      ["GET", "/api/school/teaching?term=4", 200, []],
      ["POST", "/api/school/teaching/bulk", 201, { added: [ROW], replaced: [], skipped: [] }],
      ["GET", "/api/school/teaching?term=4", 200, [ROW]],
    ]);
    const user = userEvent.setup();
    render(<TeachingView canEdit />);
    const form = await screen.findByRole("form", { name: "Assign teaching" });
    await user.selectOptions(within(form).getByLabelText(/^teacher/i), "Abena Owusu");
    await user.click(within(form).getByRole("checkbox", { name: "Mathematics" }));
    await user.click(within(form).getByRole("checkbox", { name: "Basic 2A" }));
    await user.click(within(form).getByRole("button", { name: "Assign" }));
    expect(await screen.findByRole("cell", { name: "Abena Owusu" })).toBeInTheDocument();
    expect(within(form).getByRole("status")).toHaveTextContent("Added 1 assignment.");
    expect(bodyOf(fetchMock, "POST", "/api/school/teaching/bulk")).toEqual({
      staff: 5,
      subjects: [1],
      classes: [9],
      term: null,
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
