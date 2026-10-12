import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SchoolYear } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { YearsView } from "./years-view";

const TERM = {
  id: 4,
  number: 1,
  name: "Term 1, 2026/2027",
  start_date: "2026-09-08",
  end_date: "2026-12-18",
};
const YEAR: SchoolYear = {
  id: 2,
  name: "2026/2027",
  start_date: "2026-09-01",
  end_date: "2027-07-31",
  is_current: true,
  terms: [TERM],
};

describe("YearsView", () => {
  it("lists years with their terms and marks the current one", async () => {
    mockApi([["GET", "/api/school/years", 200, [YEAR]]]);
    render(<YearsView canEdit={false} />);
    const year = await screen.findByRole("article", { name: "2026/2027" });
    expect(within(year).getByText("Current year")).toBeInTheDocument();
    expect(within(year).getByText(/Term 1/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a year" })).not.toBeInTheDocument();
  });

  it("adds a year", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/school/years", 200, []],
      ["POST", "/api/school/years", 201, { ...YEAR, terms: [] }],
    ]);
    const user = userEvent.setup();
    render(<YearsView canEdit />);
    await user.click(await screen.findByRole("button", { name: "Add a year" }));
    await user.type(screen.getByLabelText(/^name/i), "2026/2027");
    await user.type(screen.getByLabelText(/^first day/i), "2026-09-01");
    await user.type(screen.getByLabelText(/^last day/i), "2027-07-31");
    await user.click(screen.getByRole("checkbox", { name: /current year/i }));
    await user.click(screen.getByRole("button", { name: "Save year" }));
    expect(await screen.findByRole("article", { name: "2026/2027" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/school/years")).toEqual({
      name: "2026/2027",
      start_date: "2026-09-01",
      end_date: "2027-07-31",
      is_current: true,
    });
  });

  it("adds a term and shows the server's reason on the field", async () => {
    mockApi([
      ["GET", "/api/school/years", 200, [{ ...YEAR, terms: [] }]],
      [
        "POST",
        "/api/school/years/2/terms",
        400,
        {
          code: "validation_error",
          message: "Please check the highlighted fields.",
          fields: { start_date: ["A term must fall inside its school year."] },
        },
      ],
    ]);
    const user = userEvent.setup();
    render(<YearsView canEdit />);
    const year = await screen.findByRole("article", { name: "2026/2027" });
    await user.click(within(year).getByRole("button", { name: "Add a term" }));
    await user.type(within(year).getByLabelText(/^first day/i), "2026-08-01");
    await user.type(within(year).getByLabelText(/^last day/i), "2026-12-18");
    await user.click(within(year).getByRole("button", { name: "Save term" }));
    expect(await within(year).findByText("A term must fall inside its school year.")).toBeInTheDocument();
  });
});
