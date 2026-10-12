import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ClassesData } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { ClassesView } from "./classes-view";

const TERM = {
  id: 4,
  number: 1,
  name: "Term 1, 2026/2027",
  start_date: "2026-09-08",
  end_date: "2026-12-18",
};
const BASIC_2A = {
  id: 9,
  name: "Basic 2A",
  year_group: "basic_2",
  stream: "A",
  band: "lower_primary",
  academic_year: 2,
  pupils: 31,
  class_teachers: [
    { term_id: 4, term: 1, staff_id: 5, staff_name: "Abena Owusu" },
  ],
};
const DATA: ClassesData = {
  year: { id: 2, name: "2026/2027" },
  years: [{ id: 2, name: "2026/2027", is_current: true }],
  classes: [BASIC_2A],
  year_groups: [
    { code: "basic_1", name: "Basic 1" },
    { code: "basic_2", name: "Basic 2" },
  ],
  terms: [TERM],
  teachers: [
    { id: 5, name: "Abena Owusu" },
    { id: 6, name: "Yaw Boateng" },
  ],
};

describe("ClassesView", () => {
  it("lists classes and changes a class teacher", async () => {
    const changed = {
      ...BASIC_2A,
      class_teachers: [
        { term_id: 4, term: 1, staff_id: 6, staff_name: "Yaw Boateng" },
      ],
    };
    const fetchMock = mockApi([
      ["GET", "/api/school/classes", 200, DATA],
      ["PUT", "/api/school/classes/9/class-teacher", 200, changed],
    ]);
    const user = userEvent.setup();
    render(<ClassesView canEdit />);
    const card = await screen.findByRole("article", { name: "Basic 2A" });
    expect(within(card).getByText("31 pupils")).toBeInTheDocument();
    await user.selectOptions(
      within(card).getByLabelText("Class teacher, Term 1"),
      "Yaw Boateng",
    );
    expect(await within(card).findByRole("status")).toHaveTextContent("Saved");
    expect(
      bodyOf(fetchMock, "PUT", "/api/school/classes/9/class-teacher"),
    ).toEqual({ term: 4, staff: 6 });
  });

  it("adds a class to the year", async () => {
    const added = {
      ...BASIC_2A,
      id: 10,
      name: "Basic 1",
      year_group: "basic_1",
      stream: "",
      pupils: 0,
      class_teachers: [],
    };
    const fetchMock = mockApi([
      ["GET", "/api/school/classes", 200, { ...DATA, classes: [] }],
      ["POST", "/api/school/classes", 201, added],
    ]);
    const user = userEvent.setup();
    render(<ClassesView canEdit />);
    await user.selectOptions(
      await screen.findByLabelText(/^year group/i),
      "Basic 1",
    );
    await user.click(screen.getByRole("button", { name: "Add class" }));
    expect(
      await screen.findByRole("article", { name: "Basic 1" }),
    ).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/school/classes")).toEqual({
      academic_year: 2,
      year_group: "basic_1",
      stream: "",
    });
  });

  it("is read-only for the Head Teacher", async () => {
    mockApi([["GET", "/api/school/classes", 200, DATA]]);
    render(<ClassesView canEdit={false} />);
    const card = await screen.findByRole("article", { name: "Basic 2A" });
    expect(within(card).getByText("Term 1: Abena Owusu")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add class" }),
    ).not.toBeInTheDocument();
  });

  it("asks for a school year first", async () => {
    mockApi([
      [
        "GET",
        "/api/school/classes",
        200,
        { ...DATA, year: null, years: [], classes: [], terms: [] },
      ],
    ]);
    render(<ClassesView canEdit />);
    expect(
      await screen.findByText(/add a school year first/i),
    ).toBeInTheDocument();
  });
});
