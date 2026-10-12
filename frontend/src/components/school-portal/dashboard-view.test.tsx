import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/http";
import { DashboardView } from "./dashboard-view";

const DASHBOARD = {
  counts: {
    students_by_level: [{ band: "lower_primary", label: "Basic 1–3", count: 42 }],
    not_in_class: 3,
    staff: 12,
    classes: 6,
    new_enquiries: 2,
  },
  checklist: [
    { key: "demo_records", label: "Demo records removed", done: true, detail: "" },
    { key: "profile", label: "School profile complete", done: false, detail: "Add the school's logo." },
  ],
};

describe("DashboardView", () => {
  it("shows the counts and pupils by level", async () => {
    mockApi([["GET", "/api/school/dashboard", 200, DASHBOARD]]);
    render(<DashboardView />);
    expect(await screen.findByText("Basic 1–3")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument(); // 42 in classes + 3 not yet placed
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/3 not yet in a class/i)).toBeInTheDocument();
  });

  it("marks checklist items done or to do in words, not colour alone", async () => {
    mockApi([["GET", "/api/school/dashboard", 200, DASHBOARD]]);
    render(<DashboardView />);
    const list = await screen.findByRole("list", { name: "Go-live checklist" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Done");
    expect(items[1]).toHaveTextContent("To do");
    expect(items[1]).toHaveTextContent("Add the school's logo.");
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
  });
});
