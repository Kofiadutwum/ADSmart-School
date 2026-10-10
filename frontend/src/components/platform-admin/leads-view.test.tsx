import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { LeadsView } from "./leads-view";

const LEAD = {
  id: 3, school_name: "Hope Academy", contact_name: "Yaw Asante", phone: "+233241234567",
  email: "yaw@hope.example", town: "Tema", message: "About 200 pupils.", status: "new", staff_notes: "",
  created_at: "2026-10-10T09:00:00Z",
};

describe("leads inbox", () => {
  it("lists leads and saves a status change with notes", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/platform/leads", 200, [LEAD]],
      ["PATCH", "/api/platform/leads/3", 200, { ...LEAD, status: "contacted", staff_notes: "Visiting Monday" }],
    ]);
    const user = userEvent.setup();
    render(<LeadsView />);
    expect(await screen.findByRole("heading", { name: /Hope Academy/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "024 123 4567" })).toHaveAttribute("href", "tel:+233241234567");
    await user.selectOptions(screen.getByLabelText(/^status/i), "contacted");
    await user.type(screen.getByLabelText(/^notes/i), "Visiting Monday");
    await user.click(screen.getByRole("button", { name: "Save Hope Academy" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PATCH", "/api/platform/leads/3")).toEqual({
      status: "contacted",
      staff_notes: "Visiting Monday",
    });
  });
});
