import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { SchoolDetailView } from "./school-detail";

const DETAIL = {
  slug: "adsmart", name: "AD Smart School", town: "Kronom, Kumasi", region: "Ashanti Region", status: "trial",
  is_public: false, to_do: 1, created_at: "2026-10-09T23:34:00Z", url: "http://adsmart.localhost:3000",
  phone: "+233545875881", email: "school@example.com", levels_offered: ["kg"],
  blockers: ["The site has not been marked live"],
  counts: { pupils: 250, staff: 32, parents: 283, enquiries: 4 },
  administrators: [
    {
      id: 7, name: "Esi Owusu", username: "esi.owusu", phone: "+233247654321", email: "esi@adsmart.example",
      must_change_password: false, last_sign_in: "2026-10-09T14:05:00Z", is_active: true,
    },
  ],
};
const PAGE = "/api/platform/schools/adsmart";

describe("a school's page", () => {
  it("shows counts, the go-live list and the Administrators", async () => {
    mockApi([["GET", PAGE, 200, DETAIL]]);
    render(<SchoolDetailView slug="adsmart" />);
    expect(await screen.findByRole("heading", { name: "AD Smart School" })).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("The site has not been marked live")).toBeInTheDocument();
    expect(screen.getByText("024 765 4321")).toBeInTheDocument();
  });

  it("resets a password and shows the new one-time password", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApi([
      ["GET", PAGE, 200, DETAIL],
      ["POST", `${PAGE}/administrators/7/reset-password`, 200, { username: "esi.owusu", one_time_password: "pqrs-tuvw-xyz2" }],
      ["GET", PAGE, 200, DETAIL],
    ]);
    const user = userEvent.setup();
    render(<SchoolDetailView slug="adsmart" />);
    await user.click(await screen.findByRole("button", { name: "Reset password for Esi Owusu" }));
    expect(await screen.findByTestId("one-time-password")).toHaveTextContent("pqrs-tuvw-xyz2");
  });

  it("needs a reason to change the school's status", async () => {
    const fetchMock = mockApi([
      ["GET", PAGE, 200, DETAIL],
      ["POST", `${PAGE}/status`, 200, { ...DETAIL, status: "suspended" }],
    ]);
    const user = userEvent.setup();
    render(<SchoolDetailView slug="adsmart" />);
    await user.click(await screen.findByRole("button", { name: "Change status" }));
    expect(await screen.findByText("Give a reason. It goes in the audit log.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^reason/i), "Asked to pause");
    await user.click(screen.getByRole("button", { name: "Change status" }));
    expect(await screen.findByText("AD Smart School is now suspended.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", `${PAGE}/status`)).toEqual({ status: "suspended", reason: "Asked to pause" });
  });
});
