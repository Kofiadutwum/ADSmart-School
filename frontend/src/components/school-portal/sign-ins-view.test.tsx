import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { SignInsView } from "./sign-ins-view";

const CLASSES = { year: null, years: [], classes: [{ id: 7, name: "Basic 5A" }], year_groups: [] };

describe("SignInsView", () => {
  it("makes a class's pupil list with fresh passwords, leaving signed-in pupils' alone", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      [
        "POST",
        "/api/school/sign-ins/pupils",
        200,
        {
          rows: [
            { name: "Kofi Mensah", class: "Basic 5A", student_id: "ADS-1", password: "abcd-efgh-jkmn", signed_in: false },
            { name: "Yaw Mensah", class: "Basic 5A", student_id: "ADS-2", password: "", signed_in: true },
          ],
        },
      ],
    ]);
    const user = userEvent.setup();
    render(<SignInsView />);

    await user.selectOptions(await screen.findByLabelText(/class/i), "7");
    await user.click(screen.getByRole("button", { name: /make the list/i }));

    const table = await screen.findByRole("table", { name: /pupils' sign-ins/i });
    expect(within(table).getByText("abcd-efgh-jkmn")).toBeInTheDocument();
    expect(within(table).getByText("Has signed in")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/school/sign-ins/pupils")).toEqual({ class: "7" });
    expect(screen.getByRole("button", { name: /download \(csv\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
  });

  it("lists staff for the whole school, with no class to choose", async () => {
    mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      [
        "POST",
        "/api/school/sign-ins/staff",
        200,
        { rows: [{ name: "Abena Owusu", username: "abena", password: "pqrs-tuvw-xyz2", signed_in: false }] },
      ],
    ]);
    const user = userEvent.setup();
    render(<SignInsView />);

    await user.click(screen.getByRole("radio", { name: /staff/i }));
    expect(screen.queryByLabelText(/class/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /make the list/i }));

    const table = await screen.findByRole("table", { name: /staff sign-ins/i });
    expect(within(table).getByText("abena")).toBeInTheDocument();
    expect(within(table).getByText("pqrs-tuvw-xyz2")).toBeInTheDocument();
  });
});
