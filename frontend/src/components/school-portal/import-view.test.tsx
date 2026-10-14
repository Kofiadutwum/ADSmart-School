import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/http";
import { ImportView } from "./import-view";

const PUPILS = "/api/school/import/pupils";
const STAFF = "/api/school/import/staff";
const SUMMARY = { pupils: 2, new_parents: 1, existing_parents: 1, classes: ["Basic 2A"], unplaced: 0 };
const file = (name = "pupils.csv") => new File(["First name"], name, { type: "text/csv" });

describe("ImportView", () => {
  it("lists a file's problems by row, then imports it once it is clean", async () => {
    const fetchMock = mockApi([
      [
        "POST",
        PUPILS,
        200,
        { kind: "pupils", imported: false, problems: [{ row: 3, message: "Surname is missing." }], summary: SUMMARY },
      ],
      ["POST", PUPILS, 200, { kind: "pupils", imported: false, problems: [], summary: SUMMARY }],
      ["POST", PUPILS, 200, { kind: "pupils", imported: true, problems: [], summary: SUMMARY }],
    ]);
    const user = userEvent.setup();
    render(<ImportView initialKind="pupils" />);
    expect(screen.getByRole("link", { name: /download the template/i })).toHaveAttribute("href", `${PUPILS}/template`);

    await user.upload(screen.getByLabelText(/spreadsheet file/i), file());
    await user.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText("Row 3: Surname is missing.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^import/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText(/ready to import 2 pupils/i)).toHaveTextContent(
      "1 new parent account, 1 parent already registered, placed in Basic 2A",
    );
    await user.click(screen.getByRole("button", { name: "Import 2 pupils" }));
    expect(await screen.findByText(/imported 2 pupils/i)).toBeInTheDocument();
    const sent = fetchMock.mock.calls[2][1]?.body as FormData;
    expect(sent.get("commit")).toBe("1");
    expect((sent.get("file") as File).name).toBe("pupils.csv");
    expect((fetchMock.mock.calls[0][1]?.body as FormData).get("commit")).toBeNull();
  });

  it("shows staff one-time passwords once, ready to print", async () => {
    mockApi([
      ["POST", STAFF, 200, { kind: "staff", imported: false, problems: [], summary: { staff: 1 } }],
      [
        "POST",
        STAFF,
        200,
        {
          kind: "staff",
          imported: true,
          problems: [],
          summary: { staff: 1 },
          passwords: [{ name: "Abena Owusu", username: "abena", one_time_password: "tulip-river-42" }],
        },
      ],
    ]);
    const user = userEvent.setup();
    render(<ImportView initialKind="pupils" />);
    await user.click(screen.getByRole("radio", { name: /staff/i }));
    expect(screen.getByRole("link", { name: /download the template/i })).toHaveAttribute("href", `${STAFF}/template`);

    await user.upload(screen.getByLabelText(/spreadsheet file/i), file("staff.xlsx"));
    await user.click(screen.getByRole("button", { name: "Check the file" }));
    await user.click(await screen.findByRole("button", { name: "Import 1 staff member" }));
    const table = await screen.findByRole("table", { name: /one-time passwords/i });
    expect(within(table).getByText("tulip-river-42")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
  });
});
