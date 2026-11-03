import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ClassesData } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { TeachingPicker } from "./teaching-picker";

const TERM = { id: 4, number: 1, name: "Term 1", start_date: "2026-09-08", end_date: "2026-12-18" };
const row = (id: number, name: string, band: string) => ({
  id,
  name,
  year_group: "basic_4",
  stream: "",
  band,
  academic_year: 2,
  pupils: 0,
  class_teachers: [],
  subject_teachers: [],
});
const DATA: ClassesData = {
  year: { id: 2, name: "2026/2027" },
  years: [],
  classes: [row(9, "Basic 4A", "upper_primary"), row(10, "JHS 1", "jhs")],
  year_groups: [],
  terms: [TERM],
  teachers: [{ id: 5, name: "Abena Owusu" }],
};
const SUBJECTS = [
  { id: 1, name: "Mathematics", code: "MATH", bands: ["upper_primary", "jhs"], is_learning_area: false },
  { id: 2, name: "Science", code: "SCI", bands: ["upper_primary"], is_learning_area: false },
];

describe("TeachingPicker", () => {
  it("assigns ticked subjects in ticked classes for the whole year and says what happened", async () => {
    const result = {
      added: [{}, {}, {}],
      replaced: [{ teacher: "Yaw Boateng", subject: "Mathematics", class: "JHS 1", term: 1 }],
      skipped: [{ subject: "Science", class: "JHS 1" }],
    };
    const fetchMock = mockApi([["POST", "/api/school/teaching/bulk", 201, result]]);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<TeachingPicker data={DATA} subjects={SUBJECTS} onDone={onDone} />);

    await user.selectOptions(screen.getByLabelText(/^teacher/i), "5");
    await user.click(screen.getByRole("checkbox", { name: "Mathematics" }));
    await user.click(screen.getByRole("checkbox", { name: "Science" }));
    await user.click(screen.getByRole("checkbox", { name: "Basic 4A" }));
    await user.click(screen.getByRole("checkbox", { name: "JHS 1" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Added 3 assignments.");
    expect(status).toHaveTextContent("Replaced Yaw Boateng for Mathematics, JHS 1 (Term 1).");
    expect(status).toHaveTextContent("Skipped Science for JHS 1: not studied at that level.");
    expect(bodyOf(fetchMock, "POST", "/api/school/teaching/bulk")).toEqual({
      staff: 5,
      subjects: [1, 2],
      classes: [9, 10],
      term: null,
    });
    expect(onDone).toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Mathematics" })).not.toBeChecked();
  });

  it("uses the given teacher and one term, and asks for a class and a subject first", async () => {
    const fetchMock = mockApi([["POST", "/api/school/teaching/bulk", 201, { added: [{}], replaced: [], skipped: [] }]]);
    const user = userEvent.setup();
    render(<TeachingPicker staffId={7} data={DATA} subjects={SUBJECTS} onDone={() => {}} />);

    expect(screen.queryByLabelText(/^teacher/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(screen.getAllByText("Tick at least one.")).toHaveLength(2);

    await user.click(screen.getByRole("checkbox", { name: "Science" }));
    await user.click(screen.getByRole("checkbox", { name: "Basic 4A" }));
    await user.selectOptions(screen.getByLabelText(/^term/i), "4");
    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Added 1 assignment.");
    expect(bodyOf(fetchMock, "POST", "/api/school/teaching/bulk")).toEqual({
      staff: 7,
      subjects: [2],
      classes: [9],
      term: 4,
    });
  });
});
