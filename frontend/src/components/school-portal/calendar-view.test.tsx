import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CalendarMonth } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { CalendarView } from "./calendar-view";

const TERM = {
  id: 4,
  number: 1,
  name: "Term 1, 2026/2027",
  start_date: "2026-09-08",
  end_date: "2026-12-18",
};
const OCTOBER: CalendarMonth = {
  month: "2026-10",
  days: [
    { date: "2026-10-15", type: "OPEN", note: "" },
    { date: "2026-10-16", type: "OPEN", note: "" },
  ],
  terms: [TERM],
};
const NOVEMBER: CalendarMonth = { month: "2026-11", days: [], terms: [TERM] };

describe("CalendarView", () => {
  it("shows the month's days with their type in words", async () => {
    mockApi([["GET", "/api/school/calendar?month=2026-10", 200, OCTOBER]]);
    render(<CalendarView canEdit initialMonth="2026-10" />);
    expect(await screen.findByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Friday 16 October: School open" })).toBeInTheDocument();
    expect(screen.getByText("Saturday 17 October: not a school day")).toBeInTheDocument();
  });

  it("moves between months with the buttons", async () => {
    mockApi([
      ["GET", "/api/school/calendar?month=2026-10", 200, OCTOBER],
      ["GET", "/api/school/calendar?month=2026-11", 200, NOVEMBER],
    ]);
    const user = userEvent.setup();
    render(<CalendarView canEdit initialMonth="2026-10" />);
    await user.click(await screen.findByRole("button", { name: "Next month" }));
    expect(await screen.findByRole("heading", { name: "November 2026" })).toBeInTheDocument();
  });

  it("moves to the next month with a swipe to the left", async () => {
    mockApi([
      ["GET", "/api/school/calendar?month=2026-10", 200, OCTOBER],
      ["GET", "/api/school/calendar?month=2026-11", 200, NOVEMBER],
    ]);
    render(<CalendarView canEdit initialMonth="2026-10" />);
    const grid = await screen.findByRole("group", {
      name: "Days of October 2026",
    });
    fireEvent.pointerDown(grid, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(grid, { clientX: 200, pointerId: 1 });
    expect(await screen.findByRole("heading", { name: "November 2026" })).toBeInTheDocument();
  });

  it("sets a day as a holiday with a note", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/school/calendar?month=2026-10", 200, OCTOBER],
      ["PUT", "/api/school/calendar/2026-10-16", 200, { date: "2026-10-16", type: "HOLIDAY", note: "Sports day" }],
    ]);
    const user = userEvent.setup();
    render(<CalendarView canEdit initialMonth="2026-10" />);
    await user.click(
      await screen.findByRole("button", {
        name: "Friday 16 October: School open",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Friday 16 October" });
    await user.click(within(dialog).getByRole("radio", { name: "Holiday" }));
    await user.type(within(dialog).getByLabelText(/^note/i), "Sports day");
    await user.click(within(dialog).getByRole("button", { name: "Save day" }));
    expect(
      await screen.findByRole("button", {
        name: "Friday 16 October: Holiday, Sports day",
      }),
    ).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PUT", "/api/school/calendar/2026-10-16")).toEqual({
      type: "HOLIDAY",
      note: "Sports day",
    });
  });

  it("is read-only for the Head Teacher", async () => {
    mockApi([["GET", "/api/school/calendar?month=2026-10", 200, OCTOBER]]);
    render(<CalendarView canEdit={false} initialMonth="2026-10" />);
    expect(await screen.findByText("Friday 16 October: School open")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /16 October/ })).not.toBeInTheDocument();
  });
});
