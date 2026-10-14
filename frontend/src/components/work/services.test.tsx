import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { GateScreen } from "./services";

const COLLECTORS = {
  pupil: { id: 3, name: "Kojo Asante" },
  people: [{ id: 9, name: "Efua Asante", relationship: "Aunt", phone: "0245556666", has_photo: false }],
  approvals: [],
};

describe("GateScreen", () => {
  it("releases a child to a listed person", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/school/options/pupils", 200, [{ id: 3, name: "Kojo Asante (Basic 2)" }]],
      ["GET", "/api/school/care/pupils/3/collectors", 200, COLLECTORS],
      ["POST", "/api/school/care/releases", 201, { id: 1, status: "RELEASED" }],
    ]);
    const user = userEvent.setup();
    render(<GateScreen />);
    await screen.findByRole("option", { name: "Kojo Asante (Basic 2)" });
    await user.selectOptions(screen.getByLabelText("Pupil"), "3");
    await user.click(await screen.findByRole("button", { name: "Release to Efua" }));
    expect(await screen.findByText("Kojo Asante released. The family has been told.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/school/care/releases")).toEqual({ student: 3, pickup_person: 9, collector_name: "Efua Asante" });
  });

  it("records someone not on the list and alerts the family", async () => {
    mockApi([
      ["GET", "/api/school/options/pupils", 200, [{ id: 3, name: "Kojo Asante (Basic 2)" }]],
      ["GET", "/api/school/care/pupils/3/collectors", 200, COLLECTORS],
      ["POST", "/api/school/care/releases", 201, { id: 2, status: "BLOCKED" }],
    ]);
    const user = userEvent.setup();
    render(<GateScreen />);
    await screen.findByRole("option", { name: "Kojo Asante (Basic 2)" });
    await user.selectOptions(screen.getByLabelText("Pupil"), "3");
    await user.type(await screen.findByLabelText(/someone else/i), "Unknown man");
    await user.click(screen.getByRole("button", { name: "Record and alert the family" }));
    expect(await screen.findByText(/Not released/)).toBeInTheDocument();
  });
});
