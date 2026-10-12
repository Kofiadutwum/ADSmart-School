import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SchoolAudit } from "@/lib/types";
import { mockApi } from "@/test/http";
import { SchoolAuditView } from "./school-audit-view";

const AUDIT: SchoolAudit = {
  entries: [
    {
      id: 1,
      created_at: "2026-10-12T09:30:00Z",
      actor_id: 7,
      actor_name: "Ama Admin",
      action: "UPDATED",
      action_label: "Updated",
      entity_type: "academics.calendarday",
      entity_id: "12",
      reason: "",
    },
  ],
  record_types: ["academics.calendarday", "people.staff"],
  people: [{ id: 7, name: "Ama Admin" }],
};
const FILTERED = "/api/school/audit?actor=7&entity_type=people.staff&date_from=2026-10-01";

describe("SchoolAuditView", () => {
  it("lists what happened, by whom, to which record", async () => {
    mockApi([["GET", "/api/school/audit", 200, AUDIT]]);
    render(<SchoolAuditView />);
    expect(await screen.findByRole("cell", { name: "Ama Admin" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Calendar day 12" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Updated" })).toBeInTheDocument();
  });

  it("filters by person, record type and dates", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([
      ["GET", "/api/school/audit", 200, AUDIT],
      ["GET", FILTERED, 200, { ...AUDIT, entries: [] }],
    ]);
    render(<SchoolAuditView />);
    await user.selectOptions(await screen.findByLabelText(/^person/i), "Ama Admin");
    await user.selectOptions(screen.getByLabelText(/^record type/i), "Staff");
    await user.type(screen.getByLabelText(/^from/i), "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(await screen.findByText(/nothing matches/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(FILTERED, expect.anything());
  });
});
